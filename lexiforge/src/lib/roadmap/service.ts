/** Persists the learner's goal and roadmap. Every query is scoped by streamId. */

import type { CefrSubBand, RoadmapMilestone } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/http";
import { bandIndex, bandLabel, bandLowerBound, isSubBand, REQUIRED_CONSECUTIVE, type SubBand } from "@/lib/metrics/scoring";
import { clamp, round } from "@/lib/metrics/text";
import { accountabilityStatus } from "@/lib/accountability/service";
import { computeRetention, getProfile } from "@/lib/profile/service";
import { CURRICULUM, type CoreTopics } from "./curriculum";
import { effectiveTarget, estimateWeeks, milestoneStatuses, nextAction, planMilestones, remainingHours, velocityFactor, type MilestoneStatus } from "./generator";

export const GOAL_TARGETS: SubBand[] = ["A2_2", "B1_2", "B2_2", "C1_1"];
export const DAILY_MINUTES = [15, 30, 45, 60];

export async function getGoal(streamId: string) {
  return prisma.learningGoal.findUnique({ where: { streamId } });
}

/** Creates or updates the goal (past history is never touched) and regenerates the roadmap. */
export async function setGoal(streamId: string, input: { targetSubBand?: SubBand; dailyMinutes?: number; startComfort?: number; startSubBand?: SubBand; targetLabel?: string }, now: Date) {
  if (input.dailyMinutes !== undefined && !DAILY_MINUTES.includes(input.dailyMinutes)) throw new AppError(422, "INVALID_MINUTES", "Daily minutes must be 15, 30, 45 or 60.");
  const existing = await getGoal(streamId);
  const profile = await getProfile(streamId);
  const current = (profile?.subBand as SubBand | undefined) ?? input.startSubBand ?? (existing?.startSubBand as SubBand | undefined) ?? "PRE_A1";
  const desired = input.targetSubBand ?? (existing?.targetSubBand as SubBand | undefined) ?? "B1_2";
  const target = profile ? effectiveTarget(current, desired) : desired;
  const data = {
    startSubBand: (input.startSubBand ?? (existing?.startSubBand as SubBand | undefined) ?? current) as CefrSubBand,
    targetSubBand: target as CefrSubBand,
    targetLabel: input.targetLabel ?? bandLabel(target),
    dailyMinutes: input.dailyMinutes ?? existing?.dailyMinutes ?? 30,
    startComfort: input.startComfort ?? existing?.startComfort ?? 2,
  };
  const goal = await prisma.learningGoal.upsert({ where: { streamId }, update: data, create: { streamId, ...data } });
  if (profile) await regenerate(streamId, goal.startSubBand as SubBand, target, current, now);
  return goal;
}

async function regenerate(streamId: string, start: SubBand, target: SubBand, current: SubBand, now: Date) {
  const plan = planMilestones(start, target);
  const statuses = milestoneStatuses(plan.map((p) => ({ toBand: p.toBand })), current);
  const previous = await prisma.roadmapMilestone.findMany({ where: { streamId }, select: { toBand: true, completedAt: true } });
  await prisma.$transaction([
    prisma.roadmapMilestone.deleteMany({ where: { streamId } }),
    prisma.roadmapMilestone.createMany({
      data: plan.map((p, i) => ({
        streamId,
        orderIndex: p.orderIndex,
        fromBand: p.fromBand as CefrSubBand,
        toBand: p.toBand as CefrSubBand,
        titleVi: p.step.titleVi,
        titleEn: p.step.titleEn,
        outcomeVi: p.step.outcomeVi,
        outcomeEn: p.step.outcomeEn,
        coreTopicsJson: p.step.topics as unknown as object,
        status: statuses[i] as string,
        requiredGai: p.step.requiredGai,
        requiredLri: p.step.requiredLri,
        requiredRss: p.step.requiredRss,
        requiredSessions: REQUIRED_CONSECUTIVE,
        estimatedHours: p.step.hours,
        completedAt: statuses[i] === "COMPLETED" ? (previous.find((x) => x.toBand === p.toBand)?.completedAt ?? now) : null,
      })),
    }),
  ]);
}

/**
 * Keeps milestones in step with the goal and the current band: regenerates when the start/target changed,
 * otherwise only updates statuses (stamping completedAt when a step is reached).
 */
export async function syncRoadmap(streamId: string, now: Date): Promise<RoadmapMilestone[]> {
  const [goal, profile] = await Promise.all([getGoal(streamId), getProfile(streamId)]);
  if (!goal || !profile) return [];
  const current = profile.subBand as SubBand;
  const target = effectiveTarget(current, goal.targetSubBand as SubBand);
  if (target !== goal.targetSubBand) await prisma.learningGoal.update({ where: { streamId }, data: { targetSubBand: target as CefrSubBand, targetLabel: bandLabel(target) } });
  let milestones = await prisma.roadmapMilestone.findMany({ where: { streamId }, orderBy: { orderIndex: "asc" } });
  const first = milestones[0];
  const last = milestones[milestones.length - 1];
  const plannedLen = planMilestones(goal.startSubBand as SubBand, target).length;
  if (milestones.length !== plannedLen || (first && first.fromBand !== goal.startSubBand) || (last && last.toBand !== target)) {
    await regenerate(streamId, goal.startSubBand as SubBand, target, current, now);
    milestones = await prisma.roadmapMilestone.findMany({ where: { streamId }, orderBy: { orderIndex: "asc" } });
  }
  const statuses = milestoneStatuses(milestones.map((m) => ({ toBand: m.toBand as SubBand })), current);
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i] as RoadmapMilestone;
    const st = statuses[i] as MilestoneStatus;
    if (m.status !== st) {
      milestones[i] = await prisma.roadmapMilestone.update({
        where: { id: m.id, streamId },
        data: { status: st, completedAt: st === "COMPLETED" ? (m.completedAt ?? now) : null },
      });
    }
  }
  return milestones;
}

export async function roadmapView(streamId: string, now: Date) {
  const profile = await getProfile(streamId);
  const goal = await getGoal(streamId);
  if (!profile || !goal) return { ready: false as const, hasGoal: !!goal };
  const milestones = await syncRoadmap(streamId, now);
  const freshGoal = (await getGoal(streamId)) ?? goal;
  const [retention, acc, snapshots, dueCards, activeLesson] = await Promise.all([
    computeRetention(streamId, now),
    accountabilityStatus(streamId, now),
    prisma.proficiencySnapshot.findMany({ where: { streamId, takenAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, select: { takenAt: true, abilityLevel: true } }),
    prisma.srsCard.count({ where: { streamId, dueAt: { lte: now } } }),
    prisma.lessonUnit.findFirst({ where: { streamId, stage: { not: "COMPLETED" } }, orderBy: { createdAt: "desc" }, select: { id: true } }),
  ]);
  const current = profile.subBand as SubBand;
  const velocity = velocityFactor(snapshots.map((s) => ({ takenAt: s.takenAt, level: s.abilityLevel })), current, freshGoal.dailyMinutes, now);
  const hoursLeft = remainingHours(
    milestones.map((m) => ({ fromBand: m.fromBand as SubBand, toBand: m.toBand as SubBand, status: m.status as MilestoneStatus, estimatedHours: m.estimatedHours })),
    profile.abilityLevel,
    bandLowerBound,
  );
  const start = freshGoal.startSubBand as SubBand;
  const target = freshGoal.targetSubBand as SubBand;
  const span = bandLowerBound(target) - bandLowerBound(start);
  const progressPct = span > 0 ? round(clamp(((profile.abilityLevel - bandLowerBound(start)) / span) * 100, 0, 100), 1) : 100;
  const rssValue = retention.matureReviews > 0 ? retention.rss : null;
  return {
    ready: true as const,
    goal: { startSubBand: start, targetSubBand: target, targetLabel: freshGoal.targetLabel, dailyMinutes: freshGoal.dailyMinutes, startComfort: freshGoal.startComfort },
    current: { subBand: current, level: profile.abilityLevel },
    progressPct,
    reached: bandIndex(current) >= bandIndex(target),
    hoursLeft,
    weeksLeft: estimateWeeks(hoursLeft, freshGoal.dailyMinutes, velocity),
    velocity,
    next: nextAction({ calibrated: true, detoxLocked: acc.locked, dueCards, activeLessonId: activeLesson?.id ?? null, promotionUnlocked: profile.promotionAuditUnlocked }),
    milestones: milestones.map((m) => ({
      id: m.id,
      orderIndex: m.orderIndex,
      fromBand: m.fromBand as SubBand,
      toBand: m.toBand as SubBand,
      titleVi: m.titleVi,
      titleEn: m.titleEn,
      outcomeVi: m.outcomeVi,
      outcomeEn: m.outcomeEn,
      topics: m.coreTopicsJson as unknown as { vi: CoreTopics; en: CoreTopics },
      status: m.status as MilestoneStatus,
      estimatedHours: m.estimatedHours,
      completedAt: m.completedAt,
      unlock:
        m.status === "ACTIVE"
          ? {
              gai: { current: profile.gai, required: m.requiredGai, hasEvidence: profile.evidenceWords > 0 },
              lri: { current: profile.lri, required: m.requiredLri, hasEvidence: profile.evidenceWords > 0 },
              rss: { current: rssValue, required: m.requiredRss },
              sessions: { current: profile.consecutiveQualifying, required: m.requiredSessions },
              detoxClear: !acc.locked,
              auditUnlocked: profile.promotionAuditUnlocked,
            }
          : null,
    })),
  };
}

export function parseTarget(v: string): SubBand {
  if (!isSubBand(v) || !GOAL_TARGETS.includes(v)) throw new AppError(422, "INVALID_TARGET", "Choose one of the listed goals.");
  return v;
}

export { CURRICULUM };

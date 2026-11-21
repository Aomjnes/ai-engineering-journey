import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/http";
import { evaluateWriting } from "@/lib/evaluation/evaluator";
import { guardSubmission } from "@/lib/evaluation/guard";
import { saveSubmission } from "@/lib/evaluation/persist";
import { errorHalfLife, SEVERITY_WEIGHT } from "@/lib/metrics/scoring";
import { countWords } from "@/lib/metrics/text";
import { loadProductionSessions } from "@/lib/profile/service";
import { detoxElapsedEnough, detoxLock, DETOX_MIN_SECONDS, errorDebt, topRecurring } from "./rules";

const TargetsSchema = z.array(z.object({ subtype: z.string(), cleared: z.boolean() }));

async function loadErrors(userId: string) {
  return prisma.errorLog.findMany({ where: { userId }, select: { subtype: true, severity: true, resolved: true, createdAt: true } });
}

export async function accountabilityStatus(userId: string, now: Date) {
  const [errors, overdue, progress] = await Promise.all([
    loadErrors(userId),
    prisma.srsCard.count({ where: { userId, state: { not: "NEW" }, dueAt: { lte: now } } }),
    prisma.userProgress.findUnique({ where: { userId } }),
  ]);
  const debt = errorDebt(errors, now);
  const lock = detoxLock({ overdueCards: overdue, debt, lastReviewAt: progress?.lastReviewAt ?? null, lastDetoxAt: progress?.lastDetoxAt ?? null, now });
  const targets = progress?.detoxTargets ? TargetsSchema.safeParse(progress.detoxTargets) : null;
  return {
    locked: lock.locked,
    reasons: lock.reasons,
    overdueCards: overdue,
    errorDebt: debt,
    top: topRecurring(errors, now),
    detox: progress?.detoxStartedAt
      ? {
          startedAt: progress.detoxStartedAt,
          secondsRemaining: Math.max(0, DETOX_MIN_SECONDS - Math.floor((now.getTime() - progress.detoxStartedAt.getTime()) / 1000)),
          targets: targets?.success ? targets.data : [],
        }
      : null,
  };
}

export async function assertLessonsUnlocked(userId: string, now: Date): Promise<void> {
  const s = await accountabilityStatus(userId, now);
  if (s.locked) throw new AppError(423, "LOCKED_ERROR_DETOX", `New lessons are locked: ${s.reasons.join(" ")} Complete the 5-minute Error Detox first.`, { reasons: s.reasons });
}

/** Starts (or resumes) a server-timed detox targeting the top recurring subtypes. */
export async function startDetox(userId: string, now: Date) {
  const progress = await prisma.userProgress.upsert({ where: { userId }, update: {}, create: { userId } });
  if (progress.detoxStartedAt) return accountabilityStatus(userId, now);
  const top = topRecurring(await loadErrors(userId), now);
  await prisma.userProgress.update({
    where: { userId },
    data: { detoxStartedAt: now, detoxTargets: top.map((t) => ({ subtype: t.subtype, cleared: false })) },
  });
  return accountabilityStatus(userId, now);
}

/** Evidence for one detox target: the learner's own past mistakes of that subtype. */
export async function detoxExamples(userId: string, subtype: string) {
  return prisma.errorLog.findMany({
    where: { userId, subtype, resolved: false },
    orderBy: { createdAt: "desc" },
    take: 4,
    select: { original: true, correction: true, ruleEn: true, ruleVi: true, severity: true, submission: { select: { text: true } } },
  });
}

/** The learner rewrites sentences containing a recurring error; clean rewrite clears that target. */
export async function submitDetoxRewrite(userId: string, subtype: string, text: string, now: Date) {
  const progress = await prisma.userProgress.findUnique({ where: { userId } });
  if (!progress?.detoxStartedAt) throw new AppError(409, "DETOX_NOT_STARTED", "Start the Error Detox first.");
  const targets = TargetsSchema.parse(progress.detoxTargets ?? []);
  const target = targets.find((t) => t.subtype === subtype);
  if (!target) throw new AppError(404, "NOT_A_TARGET", `${subtype} is not part of this detox.`);
  const guard = guardSubmission(text, { minWords: 8, maxWords: 200 });
  if (!guard.ok) throw new AppError(422, guard.code ?? "REJECTED", guard.message ?? "Rejected.");
  const examples = await detoxExamples(userId, subtype);
  const ev = await evaluateWriting({
    text,
    prompt: `Rewrite these sentences correctly in your own words, fixing the ${subtype} pattern:\n${examples.map((e) => `- ${e.submission.text.slice(0, 300)}`).join("\n")}`,
    requiredChunks: [],
    mode: "detox",
    focusSubtype: subtype,
  });
  const repeated = ev.errors.filter((e) => e.subtype === subtype);
  const clean = repeated.length === 0 && !ev.gate.blocked;
  await saveSubmission({ userId, kind: "DETOX", text, wordCount: countWords(text), taskDifficulty: 0, gai: ev.gai.gai, lri: ev.lri.lri, passedGate: clean, errors: ev.errors });
  if (clean) {
    target.cleared = true;
    await prisma.$transaction([
      prisma.userProgress.update({ where: { userId }, data: { detoxTargets: targets } }),
      prisma.errorLog.updateMany({ where: { userId, subtype, resolved: false, createdAt: { lt: now } }, data: { resolved: true } }),
    ]);
  }
  return { clean, repeated, errors: ev.errors, gate: ev.gate, verdictEn: ev.verdictEn, verdictVi: ev.verdictVi, targets };
}

export async function completeDetox(userId: string, now: Date) {
  const progress = await prisma.userProgress.findUnique({ where: { userId } });
  if (!progress?.detoxStartedAt) throw new AppError(409, "DETOX_NOT_STARTED", "Start the Error Detox first.");
  if (!detoxElapsedEnough(progress.detoxStartedAt, now)) {
    const left = DETOX_MIN_SECONDS - Math.floor((now.getTime() - progress.detoxStartedAt.getTime()) / 1000);
    throw new AppError(409, "DETOX_TOO_SHORT", `Detox lasts at least 5 minutes. ${left}s remaining.`);
  }
  const targets = TargetsSchema.parse(progress.detoxTargets ?? []);
  const open = targets.filter((t) => !t.cleared);
  if (open.length) throw new AppError(409, "DETOX_TARGETS_OPEN", `Rewrite clean before finishing: ${open.map((t) => t.subtype).join(", ")}.`);
  await prisma.userProgress.update({ where: { userId }, data: { lastDetoxAt: now, detoxStartedAt: null, detoxTargets: [] } });
  return accountabilityStatus(userId, now);
}

/** Error Graveyard: every recurring pattern with counts, severity mix, half-life and examples. */
export async function errorGraveyard(userId: string) {
  const [errors, sessions] = await Promise.all([
    prisma.errorLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    loadProductionSessions(userId),
  ]);
  const groups = new Map<string, typeof errors>();
  for (const e of errors) groups.set(e.subtype, [...(groups.get(e.subtype) ?? []), e]);
  return [...groups.entries()]
    .map(([subtype, list]) => {
      const first = list[list.length - 1];
      const last = list[0];
      const hl = errorHalfLife(sessions, subtype);
      return {
        subtype,
        category: last?.category ?? "GRAMMAR",
        count: list.length,
        unresolved: list.filter((e) => !e.resolved).length,
        weight: list.reduce((a, e) => a + SEVERITY_WEIGHT[e.severity], 0),
        severity: { CRITICAL: list.filter((e) => e.severity === "CRITICAL").length, MODERATE: list.filter((e) => e.severity === "MODERATE").length, MINOR: list.filter((e) => e.severity === "MINOR").length },
        firstSeen: first?.createdAt ?? null,
        lastSeen: last?.createdAt ?? null,
        halfLifeDays: hl === null ? null : Number.isFinite(hl) ? hl : "not decaying",
        examples: list.slice(0, 3).map((e) => ({ original: e.original, correction: e.correction, ruleEn: e.ruleEn, ruleVi: e.ruleVi })),
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

/** Pure, deterministic roadmap math. No I/O; time and history are parameters. */

import { bandIndex, bandWidth, nextBand, SUB_BANDS, type SubBand } from "@/lib/metrics/scoring";
import { clamp, round } from "@/lib/metrics/text";
import { CURRICULUM, type CurriculumStep } from "./curriculum";

export type MilestoneStatus = "COMPLETED" | "ACTIVE" | "LOCKED";
export const STUDY_DAYS_PER_WEEK = 6;

export interface PlannedMilestone {
  orderIndex: number;
  fromBand: SubBand;
  toBand: SubBand;
  step: CurriculumStep;
}

/** Every sub-band step from `start` up to `target` (empty when start ≥ target). */
export function planMilestones(start: SubBand, target: SubBand): PlannedMilestone[] {
  const out: PlannedMilestone[] = [];
  let from = start;
  let i = 0;
  while (bandIndex(from) < bandIndex(target)) {
    const to = nextBand(from) as Exclude<SubBand, "PRE_A1">;
    out.push({ orderIndex: i++, fromBand: from, toBand: to, step: CURRICULUM[to] });
    from = to;
  }
  return out;
}

/** COMPLETED when the learner's band has reached the step's toBand; the first other step is ACTIVE. */
export function milestoneStatuses(milestones: ReadonlyArray<{ toBand: SubBand }>, current: SubBand): MilestoneStatus[] {
  let activeGiven = false;
  return milestones.map((m) => {
    if (bandIndex(current) >= bandIndex(m.toBand)) return "COMPLETED";
    if (!activeGiven) {
      activeGiven = true;
      return "ACTIVE";
    }
    return "LOCKED";
  });
}

/**
 * Velocity factor: observed level gain per day over the last 30 days ÷ expected gain per day for the current
 * step at the chosen daily minutes. Needs ≥ 3 snapshots spanning ≥ 7 days; clamped to [0.5, 1.5]; else 1.
 */
export function velocityFactor(snapshots: ReadonlyArray<{ takenAt: Date; level: number }>, currentBand: SubBand, dailyMinutes: number, now: Date): number {
  const from = now.getTime() - 30 * 86_400_000;
  const recent = snapshots.filter((s) => s.takenAt.getTime() >= from).sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  if (recent.length < 3) return 1;
  const first = recent[0] as { takenAt: Date; level: number };
  const last = recent[recent.length - 1] as { takenAt: Date; level: number };
  const days = (last.takenAt.getTime() - first.takenAt.getTime()) / 86_400_000;
  if (days < 7) return 1;
  const next = nextBand(currentBand);
  const hours = next ? CURRICULUM[next as Exclude<SubBand, "PRE_A1">].hours : 110;
  const expectedPerDay = (bandWidth(currentBand) / hours) * (dailyMinutes / 60) * (STUDY_DAYS_PER_WEEK / 7);
  if (expectedPerDay <= 0) return 1;
  const observedPerDay = (last.level - first.level) / days;
  return round(clamp(observedPerDay / expectedPerDay, 0.5, 1.5), 3);
}

/** Weeks to finish `hours` of study at `dailyMinutes` per day, 6 days a week, scaled by velocity. */
export function estimateWeeks(hours: number, dailyMinutes: number, velocity = 1): number {
  if (hours <= 0) return 0;
  const weeklyHours = (dailyMinutes / 60) * STUDY_DAYS_PER_WEEK * clamp(velocity, 0.5, 1.5);
  return Math.ceil(hours / weeklyHours);
}

/**
 * Remaining hours: full hours of LOCKED/ACTIVE steps, the ACTIVE one reduced by how far the level already sits
 * inside the current band.
 */
export function remainingHours(milestones: ReadonlyArray<{ toBand: SubBand; fromBand: SubBand; status: MilestoneStatus; estimatedHours: number }>, level: number, bandLower: (b: SubBand) => number): number {
  let total = 0;
  for (const m of milestones) {
    if (m.status === "COMPLETED") continue;
    if (m.status === "ACTIVE") {
      const lo = bandLower(m.fromBand);
      const width = bandLower(m.toBand) - lo;
      const done = width > 0 ? clamp((level - lo) / width, 0, 1) : 0;
      total += m.estimatedHours * (1 - done);
    } else total += m.estimatedHours;
  }
  return round(total, 1);
}

export interface NextActionInput {
  calibrated: boolean;
  detoxLocked: boolean;
  dueCards: number;
  activeLessonId: string | null;
  promotionUnlocked: boolean;
}

export type NextAction =
  | { kind: "ONBOARDING"; href: "/onboarding" }
  | { kind: "DETOX"; href: "/graveyard?tab=detox" }
  | { kind: "REVIEW"; href: "/graveyard" }
  | { kind: "RESUME_LESSON"; href: string }
  | { kind: "PROMOTION_AUDIT"; href: "/promotion" }
  | { kind: "NEW_LESSON"; href: "/" };

/** Today's highest-priority task (deterministic order). */
export function nextAction(i: NextActionInput): NextAction {
  if (!i.calibrated) return { kind: "ONBOARDING", href: "/onboarding" };
  if (i.detoxLocked) return { kind: "DETOX", href: "/graveyard?tab=detox" };
  if (i.dueCards > 0) return { kind: "REVIEW", href: "/graveyard" };
  if (i.activeLessonId) return { kind: "RESUME_LESSON", href: `/lesson/${i.activeLessonId}` };
  if (i.promotionUnlocked) return { kind: "PROMOTION_AUDIT", href: "/promotion" };
  return { kind: "NEW_LESSON", href: "/" };
}

/** Goal options must sit above the current band; otherwise raise to the next option (or C1.2). */
export function effectiveTarget(current: SubBand, desired: SubBand): SubBand {
  if (bandIndex(desired) > bandIndex(current)) return desired;
  const options: SubBand[] = ["A2_2", "B1_2", "B2_2", "C1_1", "C1_2"];
  return options.find((o) => bandIndex(o) > bandIndex(current)) ?? (SUB_BANDS[SUB_BANDS.length - 1] as SubBand);
}

/** Pure accountability rules (CLAUDE.md § Accountability). */

import { SEVERITY_WEIGHT, type Severity } from "@/lib/metrics/scoring";

export const OVERDUE_LOCK = 15;
export const DEBT_LOCK = 12;
export const DEBT_WINDOW_DAYS = 30;
export const RECURRING_MIN = 3;
export const REVIEW_GAP_DAYS = 7;
export const DETOX_MIN_SECONDS = 300;
export const DETOX_VALID_HOURS = 20;
export const DETOX_TARGETS = 3;

const DAY_MS = 86_400_000;

export interface LoggedError {
  subtype: string;
  severity: Severity;
  resolved: boolean;
  createdAt: Date;
}

function recentUnresolved(errors: readonly LoggedError[], now: Date): LoggedError[] {
  const from = now.getTime() - DEBT_WINDOW_DAYS * DAY_MS;
  return errors.filter((e) => !e.resolved && e.createdAt.getTime() >= from && e.createdAt.getTime() <= now.getTime());
}

/** Σ severity weights of unresolved errors (last 30 days) whose subtype occurred ≥ 3 times in that window. */
export function errorDebt(errors: readonly LoggedError[], now: Date): number {
  const recent = recentUnresolved(errors, now);
  const counts = new Map<string, number>();
  for (const e of recent) counts.set(e.subtype, (counts.get(e.subtype) ?? 0) + 1);
  return recent.filter((e) => (counts.get(e.subtype) ?? 0) >= RECURRING_MIN).reduce((acc, e) => acc + SEVERITY_WEIGHT[e.severity], 0);
}

export interface RecurringPattern {
  subtype: string;
  count: number;
  weight: number;
}

/** Top recurring unresolved subtypes by weighted count (ties: subtype name). */
export function topRecurring(errors: readonly LoggedError[], now: Date, limit = DETOX_TARGETS): RecurringPattern[] {
  const map = new Map<string, RecurringPattern>();
  for (const e of recentUnresolved(errors, now)) {
    const cur = map.get(e.subtype) ?? { subtype: e.subtype, count: 0, weight: 0 };
    cur.count++;
    cur.weight += SEVERITY_WEIGHT[e.severity];
    map.set(e.subtype, cur);
  }
  return [...map.values()].filter((p) => p.count >= 2).sort((a, b) => b.weight - a.weight || a.subtype.localeCompare(b.subtype)).slice(0, limit);
}

export interface LockInput {
  overdueCards: number;
  debt: number;
  lastReviewAt: Date | null;
  lastDetoxAt: Date | null;
  now: Date;
}

export interface LockStatus {
  locked: boolean;
  reasons: string[];
}

export function detoxLock(i: LockInput): LockStatus {
  const reasons: string[] = [];
  if (i.overdueCards >= OVERDUE_LOCK) reasons.push(`${i.overdueCards} overdue review cards (lock at ≥ ${OVERDUE_LOCK}).`);
  if (i.debt >= DEBT_LOCK) reasons.push(`Recurring-error debt ${i.debt} (lock at ≥ ${DEBT_LOCK}).`);
  if (i.overdueCards > 0 && (!i.lastReviewAt || i.now.getTime() - i.lastReviewAt.getTime() > REVIEW_GAP_DAYS * DAY_MS)) {
    reasons.push(`No reviews for more than ${REVIEW_GAP_DAYS} days with cards overdue.`);
  }
  const detoxFresh = i.lastDetoxAt !== null && i.now.getTime() - i.lastDetoxAt.getTime() < DETOX_VALID_HOURS * 3_600_000;
  return { locked: reasons.length > 0 && !detoxFresh, reasons };
}

export function detoxElapsedEnough(startedAt: Date, now: Date): boolean {
  return (now.getTime() - startedAt.getTime()) / 1000 >= DETOX_MIN_SECONDS;
}

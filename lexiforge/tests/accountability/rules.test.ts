import { describe, expect, it } from "vitest";
import { detoxElapsedEnough, detoxLock, errorDebt, topRecurring, type LoggedError } from "@/lib/accountability/rules";

const NOW = new Date("2026-06-01T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const e = (subtype: string, severity: LoggedError["severity"], daysAgo: number, resolved = false): LoggedError => ({ subtype, severity, resolved, createdAt: ago(daysAgo) });

describe("accountability rules", () => {
  it("error debt counts only unresolved, recent, recurring (≥3) subtypes", () => {
    const errors = [
      e("ARTICLE_OMISSION", "MODERATE", 1), e("ARTICLE_OMISSION", "MODERATE", 2), e("ARTICLE_OMISSION", "CRITICAL", 3),
      e("TENSE_SHIFT", "CRITICAL", 1), e("TENSE_SHIFT", "CRITICAL", 2), // only 2 → not recurring
      e("SV_AGREEMENT", "CRITICAL", 40), e("SV_AGREEMENT", "CRITICAL", 41), e("SV_AGREEMENT", "CRITICAL", 42), // too old
      e("SPELLING", "MINOR", 1, true), e("SPELLING", "MINOR", 1, true), e("SPELLING", "MINOR", 1, true), // resolved
    ];
    expect(errorDebt(errors, NOW)).toBe(1.5 + 1.5 + 3);
    expect(topRecurring(errors, NOW).map((p) => p.subtype)).toEqual(["ARTICLE_OMISSION", "TENSE_SHIFT"]);
  });

  it("locks on overdue cards, error debt, or review gap; a fresh detox unlocks for 20h", () => {
    expect(detoxLock({ overdueCards: 14, debt: 11.5, lastReviewAt: ago(1), lastDetoxAt: null, now: NOW }).locked).toBe(false);
    expect(detoxLock({ overdueCards: 15, debt: 0, lastReviewAt: ago(1), lastDetoxAt: null, now: NOW }).locked).toBe(true);
    expect(detoxLock({ overdueCards: 0, debt: 12, lastReviewAt: ago(1), lastDetoxAt: null, now: NOW }).locked).toBe(true);
    expect(detoxLock({ overdueCards: 1, debt: 0, lastReviewAt: ago(8), lastDetoxAt: null, now: NOW }).locked).toBe(true);
    expect(detoxLock({ overdueCards: 1, debt: 0, lastReviewAt: null, lastDetoxAt: null, now: NOW }).reasons).toHaveLength(1);
    expect(detoxLock({ overdueCards: 30, debt: 30, lastReviewAt: ago(9), lastDetoxAt: ago(0.5), now: NOW }).locked).toBe(false);
    expect(detoxLock({ overdueCards: 30, debt: 30, lastReviewAt: ago(9), lastDetoxAt: ago(1), now: NOW }).locked).toBe(true);
  });

  it("detox requires 300 server seconds", () => {
    expect(detoxElapsedEnough(new Date(NOW.getTime() - 299_000), NOW)).toBe(false);
    expect(detoxElapsedEnough(new Date(NOW.getTime() - 300_000), NOW)).toBe(true);
  });
});

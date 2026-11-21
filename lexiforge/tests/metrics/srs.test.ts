import { describe, expect, it } from "vitest";
import { FSRS_WEIGHTS, intervalDays, isOverdue, newCard, ratingFromRecall, retrievability, review } from "@/lib/metrics/srs";

const T0 = new Date("2026-01-01T00:00:00Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

describe("FSRS-4.5", () => {
  it("retrievability is 1 at t=0 and exactly 0.9 at t=S", () => {
    expect(retrievability(0, 5)).toBe(1);
    expect(retrievability(5, 5)).toBeCloseTo(0.9, 10);
    expect(retrievability(10, 0)).toBe(0);
  });

  it("interval equals stability at 90% target retention", () => {
    expect(intervalDays(10)).toBe(10);
    expect(intervalDays(0.2)).toBe(1);
  });

  it("initial stability per rating uses w0..w3", () => {
    for (const g of [2, 3, 4] as const) {
      const r = review(newCard(T0), g, T0);
      expect(r.card.stability).toBeCloseTo(FSRS_WEIGHTS[g - 1] as number, 3);
      expect(r.card.state).toBe("REVIEW");
    }
  });

  it("Again on a new card schedules a 10-minute relearn", () => {
    const r = review(newCard(T0), 1, T0);
    expect(r.card.state).toBe("LEARNING");
    expect(r.card.dueAt.getTime() - T0.getTime()).toBe(10 * 60_000);
    expect(r.recalled).toBe(false);
  });

  it("successful reviews grow stability; a lapse shrinks it and counts", () => {
    let c = review(newCard(T0), 3, T0).card;
    const s1 = c.stability;
    const r2 = review(c, 3, c.dueAt);
    expect(r2.card.stability).toBeGreaterThan(s1);
    expect(r2.retrievabilityAtReview).toBeCloseTo(0.9, 1);
    c = r2.card;
    const lapse = review(c, 1, day(60));
    expect(lapse.card.stability).toBeLessThan(c.stability);
    expect(lapse.card.lapses).toBe(1);
    expect(lapse.card.state).toBe("RELEARNING");
  });

  it("Easy yields longer intervals than Hard", () => {
    const base = review(newCard(T0), 3, T0).card;
    const hard = review(base, 2, day(3)).card;
    const easy = review(base, 4, day(3)).card;
    expect(easy.stability).toBeGreaterThan(hard.stability);
    expect(easy.difficulty).toBeLessThan(hard.difficulty);
  });

  it("rates typed recall deterministically", () => {
    expect(ratingFromRecall("take into account", "take into account", 3000)).toBe(4);
    expect(ratingFromRecall("take into account", "Take into account.", 9000)).toBe(3);
    expect(ratingFromRecall("take into account", "take in account", 3000)).toBe(2);
    expect(ratingFromRecall("take into account", "consider", 3000)).toBe(1);
    expect(ratingFromRecall("take into account", "   ", 3000)).toBe(1);
  });

  it("overdue detection ignores NEW cards", () => {
    expect(isOverdue({ state: "NEW", dueAt: T0 }, day(1))).toBe(false);
    expect(isOverdue({ state: "REVIEW", dueAt: T0 }, day(1))).toBe(true);
  });
});

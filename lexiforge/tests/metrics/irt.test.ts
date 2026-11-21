import { describe, expect, it } from "vitest";
import { abilityStandardError, estimateAbility, pCorrect, pickNextItem } from "@/lib/metrics/irt";

describe("1PL placement estimator", () => {
  it("P = 0.5 when θ = b", () => {
    expect(pCorrect(50, 50)).toBe(0.5);
  });

  it("returns the prior mean with no responses", () => {
    expect(estimateAbility([])).toBe(40);
  });

  it("is finite and high for all-correct, low for all-wrong", () => {
    const hard = [70, 75, 80, 85].map((d) => ({ difficulty: d, correct: true }));
    const easy = [10, 15, 20, 25].map((d) => ({ difficulty: d, correct: false }));
    expect(estimateAbility(hard)).toBeGreaterThan(70);
    expect(estimateAbility(hard)).toBeLessThanOrEqual(100);
    expect(estimateAbility(easy)).toBeLessThan(20);
  });

  it("lands between the hardest passed and easiest failed item", () => {
    const r = [
      { difficulty: 30, correct: true },
      { difficulty: 40, correct: true },
      { difficulty: 50, correct: false },
      { difficulty: 60, correct: false },
    ];
    const t = estimateAbility(r);
    expect(t).toBeGreaterThan(38);
    expect(t).toBeLessThan(52);
  });

  it("standard error shrinks with more items", () => {
    const few = [{ difficulty: 40, correct: true }];
    const many = Array.from({ length: 12 }, (_, i) => ({ difficulty: 35 + i, correct: i % 2 === 0 }));
    expect(abilityStandardError(40, many)).toBeLessThan(abilityStandardError(40, few));
  });

  it("picks the closest unused item", () => {
    const items = [{ difficulty: 10 }, { difficulty: 40 }, { difficulty: 45 }];
    expect(pickNextItem(items, new Set(), 44)).toBe(2);
    expect(pickNextItem(items, new Set([2]), 44)).toBe(1);
    expect(pickNextItem(items, new Set([0, 1, 2]), 44)).toBeNull();
  });
});

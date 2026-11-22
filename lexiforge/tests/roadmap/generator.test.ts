import { describe, expect, it } from "vitest";
import { CURRICULUM } from "@/lib/roadmap/curriculum";
import { effectiveTarget, estimateWeeks, milestoneStatuses, nextAction, planMilestones, remainingHours, velocityFactor } from "@/lib/roadmap/generator";
import { bandLowerBound, SUB_BANDS } from "@/lib/metrics/scoring";

const NOW = new Date("2026-09-01T00:00:00Z");

describe("roadmap generator (deterministic)", () => {
  it("Pre-A1 → B1.2 yields one milestone per sub-band step, in order, with bilingual outcomes", () => {
    const plan = planMilestones("PRE_A1", "B1_2");
    expect(plan.map((p) => `${p.fromBand}>${p.toBand}`)).toEqual(["PRE_A1>A1_1", "A1_1>A1_2", "A1_2>A2_1", "A2_1>A2_2", "A2_2>B1_1", "B1_1>B1_2"]);
    plan.forEach((p, i) => {
      expect(p.orderIndex).toBe(i);
      expect(p.step.titleVi.length).toBeGreaterThan(3);
      expect(p.step.outcomeVi.length).toBeGreaterThan(10);
      expect(p.step.outcomeEn.length).toBeGreaterThan(10);
      expect(p.step.topics.vi.chunks.length).toBeGreaterThan(0);
      expect(p.step.topics.en.pronunciation.length).toBeGreaterThan(0);
      expect(p.step.hours).toBeGreaterThan(0);
    });
    expect(planMilestones("B1_2", "B1_2")).toEqual([]);
    expect(planMilestones("B2_1", "B1_2")).toEqual([]);
  });

  it("every curriculum step has unlock thresholds that rise with the level", () => {
    const steps = SUB_BANDS.slice(1).map((b) => CURRICULUM[b as keyof typeof CURRICULUM]);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.requiredGai).toBeGreaterThanOrEqual(steps[i - 1]!.requiredGai);
      expect(steps[i]!.requiredLri).toBeGreaterThanOrEqual(steps[i - 1]!.requiredLri);
    }
  });

  it("statuses: reached steps COMPLETED, exactly one ACTIVE, rest LOCKED", () => {
    const plan = planMilestones("PRE_A1", "B1_2");
    expect(milestoneStatuses(plan, "PRE_A1")).toEqual(["ACTIVE", "LOCKED", "LOCKED", "LOCKED", "LOCKED", "LOCKED"]);
    expect(milestoneStatuses(plan, "A2_1")).toEqual(["COMPLETED", "COMPLETED", "COMPLETED", "ACTIVE", "LOCKED", "LOCKED"]);
    expect(milestoneStatuses(plan, "B1_2")).toEqual(Array(6).fill("COMPLETED"));
  });

  it("honest time estimate: more minutes per day → fewer weeks; velocity scales it", () => {
    const plan = planMilestones("PRE_A1", "B1_2").map((p, i) => ({ fromBand: p.fromBand, toBand: p.toBand, status: (i === 0 ? "ACTIVE" : "LOCKED") as "ACTIVE" | "LOCKED", estimatedHours: p.step.hours }));
    const total = plan.reduce((a, m) => a + m.estimatedHours, 0);
    expect(remainingHours(plan, 0, bandLowerBound)).toBeCloseTo(total, 5);
    const halfway = remainingHours(plan, 7.5, bandLowerBound); // halfway through Pre-A1 (0–15)
    expect(halfway).toBeCloseTo(total - plan[0]!.estimatedHours / 2, 1);
    const w15 = estimateWeeks(total, 15);
    const w60 = estimateWeeks(total, 60);
    expect(w15).toBeGreaterThan(w60);
    expect(estimateWeeks(total, 30, 1.5)).toBeLessThan(estimateWeeks(total, 30, 1));
    expect(estimateWeeks(0, 30)).toBe(0);
    // 6 study days per week: 120 h at 60 min/day = 20 weeks.
    expect(estimateWeeks(120, 60)).toBe(20);
  });

  it("velocity is neutral without enough history and clamped otherwise", () => {
    expect(velocityFactor([], "A1_1", 30, NOW)).toBe(1);
    const fast = [0, 5, 10, 15].map((d) => ({ takenAt: new Date(NOW.getTime() - (20 - d) * 86_400_000), level: 15 + d * 3 }));
    const v = velocityFactor(fast, "A1_1", 15, NOW);
    expect(v).toBeGreaterThanOrEqual(0.5);
    expect(v).toBeLessThanOrEqual(1.5);
  });

  it("goal targets always sit above the current band", () => {
    expect(effectiveTarget("PRE_A1", "B1_2")).toBe("B1_2");
    expect(effectiveTarget("B1_2", "B1_2")).toBe("B2_2");
    expect(effectiveTarget("C1_1", "A2_2")).toBe("C1_2");
  });

  it("next action priority: onboarding > detox > review > resume > audit > new lesson", () => {
    const base = { calibrated: true, detoxLocked: false, dueCards: 0, activeLessonId: null, promotionUnlocked: false };
    expect(nextAction({ ...base, calibrated: false }).kind).toBe("ONBOARDING");
    expect(nextAction({ ...base, detoxLocked: true, dueCards: 3 }).kind).toBe("DETOX");
    expect(nextAction({ ...base, dueCards: 3, activeLessonId: "l1" }).kind).toBe("REVIEW");
    expect(nextAction({ ...base, activeLessonId: "l1" })).toEqual({ kind: "RESUME_LESSON", href: "/lesson/l1" });
    expect(nextAction({ ...base, promotionUnlocked: true }).kind).toBe("PROMOTION_AUDIT");
    expect(nextAction(base).kind).toBe("NEW_LESSON");
  });
});

import { describe, expect, it } from "vitest";
import { TIER0_EARLY_STOP_MISSES } from "@/lib/diagnostic/item-bank";
import { answerUnit, computePlacementResult, currentUnitId, initPlacement, PlacementFlowError, PRE_A1_CEILING, publicItem, skipWriting, type PlacementState, type Tier } from "@/lib/diagnostic/placement";
import { bandIndex } from "@/lib/metrics/scoring";
import { oracleAnswer } from "./oracle";

/** Runs the staircase with a per-tier policy until writing or done. */
function run(start: Tier, policy: (tier: number) => boolean | "skip"): PlacementState {
  let s = initPlacement(start);
  for (let guard = 0; guard < 200 && s.phase === "OBJECTIVE"; guard++) {
    const id = currentUnitId(s) as string;
    const p = policy(s.tier);
    s = answerUnit(s, id, p === "skip" ? { kind: "skip" } : oracleAnswer(id, s.tier, p));
  }
  return s;
}

const noTrap = () => undefined;

describe("adaptive staircase placement", () => {
  it("Tier 0: a true beginner who skips everything stops early — no essay, Pre-A1/A1.1 only", () => {
    const s = run(0, () => "skip");
    expect(s.phase).toBe("DONE");
    expect(s.writingTier).toBeNull();
    expect(s.stoppedEarly).toBe(true);
    expect(s.served.length).toBe(TIER0_EARLY_STOP_MISSES); // stops after 4 misses, not the full block
    const r = computePlacementResult(s, null, noTrap);
    expect(r.level).toBeLessThanOrEqual(PRE_A1_CEILING);
    expect(["PRE_A1", "A1_1"]).toContain(r.subBand);
    expect(r.skipped).toBe(TIER0_EARLY_STOP_MISSES);
    expect(r.ielts.band).toBeLessThan(3.5);
  });

  it("Tier 0 below 50% without early stop still ends without writing", () => {
    // Alternate right/wrong is 50% for the first items; make it 3 right out of 8 deterministically.
    let n = 0;
    const s = run(0, () => n++ % 3 === 0);
    expect(s.phase).toBe("DONE");
    expect(s.writingTier).toBeNull();
    expect(computePlacementResult(s, null, noTrap).level).toBeLessThanOrEqual(PRE_A1_CEILING);
  });

  it("climbs the whole staircase 0 → 1 → 2 → 3 for a strong learner and ends with the C1 writing task", () => {
    const s = run(0, () => true);
    expect(s.visited).toEqual([0, 1, 2, 3]);
    expect(s.phase).toBe("WRITING");
    expect(s.writingTier).toBe(3);
    const r = computePlacementResult(s, { gai: 92, lri: 88, words: 110 }, noTrap);
    expect(bandIndex(r.subBand)).toBeGreaterThanOrEqual(bandIndex("B2_1"));
  });

  it("descends 2 → 1 → 0 for a learner who over-estimated their comfort", () => {
    const s = run(2, () => false);
    expect(s.visited).toEqual([2, 1, 0]);
    expect(s.phase).toBe("DONE");
    expect(computePlacementResult(s, null, noTrap).subBand).toMatch(/^(PRE_A1|A1_1)$/);
  });

  it("stops between tiers: passes Tier 2, fails Tier 3 → writing at Tier 2", () => {
    const s = run(2, (t) => t === 2);
    expect(s.visited).toEqual([2, 3]);
    expect(s.phase).toBe("WRITING");
    expect(s.writingTier).toBe(2);
    expect(s.tierAccuracy["2"]).toBe(1);
    expect(s.tierAccuracy["3"]).toBe(0);
    const r = computePlacementResult(s, { gai: 70, lri: 60, words: 80 }, noTrap);
    expect(bandIndex(r.subBand)).toBeGreaterThanOrEqual(bandIndex("A2_2"));
    expect(bandIndex(r.subBand)).toBeLessThanOrEqual(bandIndex("B2_2"));
  });

  it("writing can be skipped; the result then relies on objective items only", () => {
    const s = skipWriting(run(1, (t) => t === 1));
    expect(s.phase).toBe("DONE");
    expect(s.writingSkipped).toBe(true);
    const r = computePlacementResult(s, null, noTrap);
    expect(r.writingLevel).toBeNull();
    expect(r.gai).toBeNull();
  });

  it("never leaks answer keys and rejects out-of-order answers", () => {
    let s = initPlacement(0);
    for (let i = 0; i < 8 && s.phase === "OBJECTIVE"; i++) {
      const view = JSON.stringify(publicItem(s));
      expect(view).not.toMatch(/"answer"|"sentence"/);
      s = answerUnit(s, currentUnitId(s) as string, oracleAnswer(currentUnitId(s) as string, s.tier, true));
    }
    const s2 = initPlacement(2);
    const view2 = JSON.stringify(publicItem(s2));
    expect(view2).not.toMatch(/"answer"|"trap"|"explanation"/);
    expect(() => answerUnit(s2, "not-the-current-item", { kind: "skip" })).toThrow(PlacementFlowError);
  });
});

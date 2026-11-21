import { describe, expect, it } from "vitest";
import { ERROR_ITEMS, ERROR_ITEMS_SERVED, READING_PASSAGES, READING_PASSAGES_SERVED } from "@/lib/diagnostic/item-bank";
import { answerErrorItem, answerReading, computePlacementResult, initPlacement, PlacementFlowError, publicItem, writingImpliedLevel, type PlacementState } from "@/lib/diagnostic/placement";
import { profileText } from "@/lib/metrics/readability";

/** Simulates a learner of true level `trueLevel` who answers correctly iff item difficulty < trueLevel. */
function simulate(trueLevel: number): PlacementState {
  let s = initPlacement(0);
  while (s.part === "READING") {
    const p = READING_PASSAGES.find((x) => x.id === s.currentId);
    if (!p) throw new Error("missing passage");
    s = answerReading(s, p.id, p.questions.map((q) => (q.difficulty < trueLevel ? q.answer : (q.answer + 1) % 4)));
  }
  while (s.part === "ERRORS") {
    const it = ERROR_ITEMS.find((x) => x.id === s.currentId);
    if (!it) throw new Error("missing item");
    s = answerErrorItem(s, it.id, it.difficulty < trueLevel ? it.answer : (it.answer + 1) % 5);
  }
  return s;
}

describe("item bank integrity", () => {
  it("has passages for every sub-band with increasing difficulty and valid keys", () => {
    expect(READING_PASSAGES).toHaveLength(8);
    const ds = READING_PASSAGES.map((p) => p.difficulty);
    expect([...ds].sort((a, b) => a - b)).toEqual(ds);
    for (const p of READING_PASSAGES) for (const q of p.questions) expect(q.options[q.answer]).toBeTruthy();
    expect(new Set(ERROR_ITEMS.map((i) => i.id)).size).toBe(ERROR_ITEMS.length);
  });

  it("measured readability broadly agrees with assigned passage difficulty", () => {
    const easy = profileText(READING_PASSAGES[0]?.text ?? "").difficultyScore;
    const hard = profileText(READING_PASSAGES[7]?.text ?? "").difficultyScore;
    expect(hard).toBeGreaterThan(easy + 30);
  });
});

describe("adaptive placement flow", () => {
  it("serves 4 passages then 8 error items then writing, never leaking answers", () => {
    const s = simulate(50);
    expect(s.part).toBe("WRITING");
    expect(s.readingServed).toHaveLength(READING_PASSAGES_SERVED);
    expect(s.errorServed).toHaveLength(ERROR_ITEMS_SERVED);
    const first = publicItem(initPlacement(0));
    expect(JSON.stringify(first)).not.toContain('"answer"');
  });

  it("rejects out-of-order answers", () => {
    const s = initPlacement(0);
    expect(() => answerReading(s, "r-c1-2", [0, 0])).toThrow(PlacementFlowError);
    expect(() => answerErrorItem(s, "e-01", 0)).toThrow(PlacementFlowError);
    expect(() => answerReading(s, s.currentId ?? "", [0])).toThrow(PlacementFlowError);
  });

  it("places weak and strong simulated learners in the right region", () => {
    const weak = computePlacementResult(simulate(15), { gai: 45, lri: 40, words: 90 });
    const strong = computePlacementResult(simulate(85), { gai: 95, lri: 85, words: 110 });
    expect(weak.level).toBeLessThan(30);
    expect(strong.level).toBeGreaterThan(70);
    expect(["A2_1", "A2_2", "B1_1"]).toContain(weak.subBand);
    expect(["C1_1", "C1_2", "B2_2"]).toContain(strong.subBand);
    expect(strong.ielts.band).toBeGreaterThan(weak.ielts.band);
    expect(weak.missedTraps.length).toBeGreaterThan(0);
  });

  it("writing-implied level formula", () => {
    expect(writingImpliedLevel(30, 30)).toBe(0);
    expect(writingImpliedLevel(95, 95)).toBe(100);
    expect(writingImpliedLevel(60, 60)).toBeCloseTo((30 * 100) / 65, 6);
  });
});

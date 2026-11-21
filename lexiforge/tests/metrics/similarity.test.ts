import { describe, expect, it } from "vitest";
import { detectCopy, jaccard, levenshtein, textJaccard } from "@/lib/metrics/similarity";

const SOURCE =
  "The city council voted on Tuesday to ban cars from the historic centre. Shop owners fear a drop in sales. Environmental groups welcomed the decision as long overdue.";

describe("copy-paste detector", () => {
  it("computes Jaccard exactly", () => {
    expect(jaccard(new Set([1, 2, 3]), new Set([2, 3, 4]))).toBe(0.5);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it("rejects a verbatim sentence", () => {
    const r = detectCopy("Shop owners fear a drop in sales.", SOURCE);
    expect(r.isCopy).toBe(true);
    expect(r.maxJaccard).toBe(1);
    expect(r.matchedWindow).toBe("Shop owners fear a drop in sales.");
  });

  it("rejects two lifted sentences (multi-sentence window)", () => {
    const r = detectCopy("Shop owners fear a drop in sales. Environmental groups welcomed the decision as long overdue.", SOURCE);
    expect(r.isCopy).toBe(true);
  });

  it("accepts a genuine paraphrase", () => {
    const r = detectCopy("Local businesses are worried they will earn less money once vehicles are kept out.", SOURCE);
    expect(r.isCopy).toBe(false);
    expect(r.maxJaccard).toBeLessThan(0.2);
  });

  it("uses the 0.65 threshold strictly (> not ≥)", () => {
    // 2 of 3 trigrams shared with a 3-trigram window → J = 2/4 = 0.5
    expect(detectCopy("shop owners fear a lot", "Shop owners fear a drop.").isCopy).toBe(false);
  });

  it("handles empty answers and very short answers", () => {
    expect(detectCopy("", SOURCE).isCopy).toBe(false);
    expect(detectCopy("sales", SOURCE).maxJaccard).toBeLessThan(0.65);
  });

  it("textJaccard and levenshtein", () => {
    expect(textJaccard("a b c d", "a b c d")).toBe(1);
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

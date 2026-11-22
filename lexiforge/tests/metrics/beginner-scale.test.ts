import { describe, expect, it } from "vitest";
import { bandFromLevel, bandWidth, computeGai, computeLri, diversityScore, ieltsEstimate, isBeginnerBand, SHORT_TEXT_FLOOR, SUB_BANDS, type ScoredError } from "@/lib/metrics/scoring";

const err = (text: string, needle: string, severity: ScoredError["severity"] = "CRITICAL"): ScoredError => {
  const start = text.indexOf(needle);
  return { start, end: start + needle.length, category: "GRAMMAR", subtype: "SV_AGREEMENT", severity };
};

describe("Pre-A1 / A1 scoring edge cases", () => {
  it("empty and whitespace input never divides by zero", () => {
    for (const t of ["", "   ", "\n\n"]) {
      const g = computeGai(t, []);
      expect(Number.isFinite(g.gai)).toBe(true);
      expect(g.words).toBe(0);
      expect(Number.isFinite(g.weightedErrorsPer100W)).toBe(true);
      const l = computeLri({ text: t, errors: [], chunksRequired: 0, chunksUsedCorrectly: 0 });
      expect(Number.isFinite(l.lri)).toBe(true);
      expect(diversityScore(t)).toBe(0);
    }
  });

  it("a 5-word answer with one critical slip is not treated as 20 errors per 100 words", () => {
    const t = "She go to school today.";
    const g = computeGai(t, [err(t, "go")]);
    // density uses max(W, 20) as the denominator
    expect(g.weightedErrorsPer100W).toBeCloseTo((100 * 3) / SHORT_TEXT_FLOOR, 10);
    expect(g.rawErrorsPer100W).toBeCloseTo(20, 10);
    expect(g.gai).toBeGreaterThan(0);
    expect(g.gai).toBeLessThan(computeGai(t, []).gai);
  });

  it("a correct 5-word sentence scores full grammar accuracy", () => {
    expect(computeGai("I like green tea a lot.", []).gai).toBe(100);
  });

  it("short-text diversity blends TTR so a varied 5-word answer isn't scored as zero vocabulary", () => {
    const varied = diversityScore("I drink coffee every morning.");
    const repeated = diversityScore("good good good good good.");
    expect(varied).toBeGreaterThan(repeated);
    expect(varied).toBeGreaterThan(0);
    expect(repeated).toBe(0);
  });

  it("LRI with no required chunks stays within 0–100 for tiny texts", () => {
    for (const t of ["Hi.", "My name is Lan.", "I am a student in Hanoi and I like music."]) {
      const l = computeLri({ text: t, errors: [], chunksRequired: 0, chunksUsedCorrectly: 0 });
      expect(l.lri).toBeGreaterThanOrEqual(0);
      expect(l.lri).toBeLessThanOrEqual(100);
      expect(l.cdr).toBeNull();
    }
  });

  it("the scale has 11 contiguous sub-bands with positive widths; Pre-A1 to A1.2 are beginner bands", () => {
    expect(SUB_BANDS).toHaveLength(11);
    for (const b of SUB_BANDS) expect(bandWidth(b)).toBeGreaterThan(0);
    expect(isBeginnerBand("PRE_A1")).toBe(true);
    expect(isBeginnerBand("A1_2")).toBe(true);
    expect(isBeginnerBand("A2_1")).toBe(false);
    expect(bandFromLevel(0)).toBe("PRE_A1");
  });

  it("IELTS for a zero-evidence Pre-A1 learner is below 3.0 and the range stays inside [2.5, 8.5]", () => {
    const e = ieltsEstimate(3, 0, 0);
    expect(e.band).toBeLessThan(3);
    expect(e.low).toBeGreaterThanOrEqual(2.5);
    expect(e.high).toBeLessThanOrEqual(8.5);
  });
});

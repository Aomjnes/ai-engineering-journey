import { describe, expect, it } from "vitest";
import { comprehensibility, difficultyFrom, fleschKincaidGrade, fleschReadingEase, profileText, tierFromDifficulty } from "@/lib/metrics/readability";

describe("readability", () => {
  it("computes the exact Flesch-Kincaid and Reading Ease formulas", () => {
    // 100 words, 5 sentences, 150 syllables
    expect(fleschKincaidGrade(100, 5, 150)).toBeCloseTo(0.39 * 20 + 11.8 * 1.5 - 15.59, 10);
    expect(fleschReadingEase(100, 5, 150)).toBeCloseTo(206.835 - 1.015 * 20 - 84.6 * 1.5, 10);
    expect(fleschKincaidGrade(0, 0, 0)).toBe(0);
  });

  it("maps difficulty and tiers deterministically", () => {
    expect(difficultyFrom(4, 0.05)).toBe(0);
    expect(difficultyFrom(16, 0.35)).toBe(100);
    expect(difficultyFrom(10, 0.2)).toBeCloseTo(30 + 20, 10);
    expect(tierFromDifficulty(24.99)).toBe("A2");
    expect(tierFromDifficulty(25)).toBe("B1");
    expect(tierFromDifficulty(50)).toBe("B2");
    expect(tierFromDifficulty(75)).toBe("C1");
  });

  it("ranks a simple text below an academic one", () => {
    const easy = "The cat sat on the mat. It was a sunny day. The boy ran to the park with his dog. They played all day.";
    const hard =
      "Epistemological frameworks underpinning contemporary computational neuroscience presuppose that representational content supervenes on informational relations, a contention that remains philosophically contested. Consequently, interdisciplinary methodologies increasingly interrogate the ontological commitments embedded within ostensibly neutral quantitative paradigms.";
    const a = profileText(easy);
    const b = profileText(hard);
    expect(a.difficultyScore).toBeLessThan(b.difficultyScore);
    expect(a.cefrTier).toBe("A2");
    expect(b.cefrTier).toBe("C1");
    expect(a.sentenceCount).toBe(4);
  });

  it("handles empty text", () => {
    const p = profileText("");
    expect(p.wordCount).toBe(0);
    expect(p.difficultyScore).toBe(0);
  });

  it("estimates comprehensibility from core band plus known lemmas", () => {
    expect(comprehensibility("The house is big.")).toBe(1);
    const c1 = comprehensibility("The ubiquitous algorithm proliferates.");
    const c2 = comprehensibility("The ubiquitous algorithm proliferates.", new Set(["ubiquitous", "algorithm", "proliferate"]));
    expect(c1).toBeLessThan(c2);
    expect(c2).toBe(1);
  });
});

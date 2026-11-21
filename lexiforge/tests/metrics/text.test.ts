import { describe, expect, it } from "vitest";
import { countSyllables, isCoreWord, lemmaCandidates, splitSentences, tokenize } from "@/lib/metrics/text";

describe("text primitives", () => {
  it("splits sentences with offsets, respecting abbreviations and decimals", () => {
    const t = "Dr. Smith paid $3.50 for it. Was it worth it? Yes!";
    const s = splitSentences(t);
    expect(s.map((x) => x.text)).toEqual(["Dr. Smith paid $3.50 for it.", "Was it worth it?", "Yes!"]);
    for (const span of s) expect(t.slice(span.start, span.end)).toBe(span.text);
  });

  it("handles text with no terminal punctuation and empty input", () => {
    expect(splitSentences("no punctuation here")).toHaveLength(1);
    expect(splitSentences("   ")).toHaveLength(0);
  });

  it("tokenizes with apostrophes and numbers", () => {
    expect(tokenize("It’s 2026, and they don't care.")).toEqual(["it's", "2026", "and", "they", "don't", "care"]);
  });

  it("counts syllables heuristically", () => {
    expect(countSyllables("cat")).toBe(1);
    expect(countSyllables("table")).toBe(1 + 1);
    expect(countSyllables("beautiful")).toBe(3);
    expect(countSyllables("")).toBe(0);
  });

  it("lemmatizes common inflections and recognizes core words", () => {
    expect(lemmaCandidates("stopped")).toContain("stop");
    expect(lemmaCandidates("studies")).toContain("study");
    expect(lemmaCandidates("watches")).toContain("watch");
    expect(isCoreWord("running")).toBe(true);
    expect(isCoreWord("children")).toBe(true);
    expect(isCoreWord("epistemology")).toBe(false);
    expect(isCoreWord("epistemology", new Set(["epistemology"]))).toBe(true);
  });
});

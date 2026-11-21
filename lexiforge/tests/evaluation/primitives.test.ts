import { describe, expect, it } from "vitest";
import { chunkPresent } from "@/lib/evaluation/chunks";
import { guardSubmission } from "@/lib/evaluation/guard";
import { buildInlineDiff, repairSpans } from "@/lib/evaluation/spans";
import type { EvidenceError } from "@/lib/evaluation/schemas";

const base: Omit<EvidenceError, "original" | "start" | "end"> = {
  correction: "x", category: "GRAMMAR", subtype: "TENSE_SHIFT", severity: "MODERATE", ruleEn: "rule", ruleVi: "quy tắc",
};

describe("span repair", () => {
  const text = "He go to school. He go home.";
  it("keeps correct spans, repairs wrong offsets to the nearest occurrence, drops hallucinations", () => {
    const r = repairSpans(text, [
      { ...base, original: "go", start: 3, end: 5 },
      { ...base, original: "go", start: 18, end: 22 }, // wrong end
      { ...base, original: "goes", start: 0, end: 4 }, // not in text
    ]);
    expect(r.errors.map((e) => [e.start, e.end])).toEqual([[3, 5], [20, 22]]);
    expect(r.repaired).toBe(1);
    expect(r.dropped).toHaveLength(1);
  });
  it("collapses duplicates and builds an inline diff", () => {
    const r = repairSpans(text, [{ ...base, original: "go", start: 3, end: 5 }, { ...base, original: "go", start: 3, end: 5 }]);
    expect(r.errors).toHaveLength(1);
    const diff = buildInlineDiff(text, r.errors);
    expect(diff.map((d) => d.text).join("")).toBe(text);
    expect(diff.filter((d) => d.type === "error")).toHaveLength(1);
  });
});

describe("deterministic chunk presence", () => {
  it("accepts inflections, placeholders and gaps; rejects absence", () => {
    expect(chunkPresent("The council took the risks into account before voting.", "take sth into account")).toBe(true);
    expect(chunkPresent("Prices have risen sharply this year.", "rise sharply")).toBe(true);
    expect(chunkPresent("She is bringing about real change.", "bring about")).toBe(true);
    expect(chunkPresent("The council voted yesterday.", "take into account")).toBe(false);
    expect(chunkPresent("account into take", "take into account")).toBe(false);
  });
});

describe("garbage guard", () => {
  it("rejects empty, short, non-English, gibberish and repetitive text", () => {
    expect(guardSubmission("", { minWords: 5, maxWords: 50 }).code).toBe("EMPTY");
    expect(guardSubmission("Too short.", { minWords: 5, maxWords: 50 }).code).toBe("TOO_SHORT");
    expect(guardSubmission("Tôi rất thích học tiếng Anh mỗi ngày với bạn bè.", { minWords: 5, maxWords: 50 }).code).toBe("NOT_ENGLISH");
    expect(guardSubmission("asdkj qwpoe zmxncb lkajsd qwoeiu zxmcnv", { minWords: 5, maxWords: 50 }).code).toBe("GIBBERISH");
    expect(guardSubmission("good good good good good good good good good good", { minWords: 5, maxWords: 50 }).code).toBe("REPETITIVE");
    expect(guardSubmission("I think the city should ban cars because the air is dirty.", { minWords: 5, maxWords: 50 }).ok).toBe(true);
  });
});

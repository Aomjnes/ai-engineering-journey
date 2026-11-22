import { describe, expect, it } from "vitest";
import { wordDiff } from "@/lib/metrics/similarity";

describe("dictation word diff", () => {
  it("is perfect for an exact transcript (case and punctuation insensitive)", () => {
    const d = wordDiff("She doesn't like coffee.", "she doesn’t like coffee");
    expect(d.perfect).toBe(true);
    expect(d.accuracy).toBe(1);
  });

  it("marks missing, extra, misspelled and wrong words exactly", () => {
    const d = wordDiff("I take the bus to work every day", "I take bus to wrok every single night");
    expect(d.ops.map((o) => o.type)).toEqual(["ok", "ok", "missing", "ok", "ok", "misspelled", "ok", "extra", "wrong"]);
    expect(d.correct).toBe(5);
    expect(d.accuracy).toBeCloseTo(5 / 8, 10);
    expect(d.perfect).toBe(false);
  });

  it("normalizes small numbers written as digits (speech-to-text)", () => {
    expect(wordDiff("I have two cats", "I have 2 cats").perfect).toBe(true);
  });

  it("handles empty input without dividing by zero", () => {
    expect(wordDiff("", "").accuracy).toBe(0);
    const d = wordDiff("hello there", "");
    expect(d.accuracy).toBe(0);
    expect(d.ops).toEqual([{ type: "missing", expected: "hello" }, { type: "missing", expected: "there" }]);
  });
});

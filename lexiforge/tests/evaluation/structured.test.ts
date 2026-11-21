import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJson, generateStructured, StructuredOutputError } from "@/lib/llm/structured";
import { findBannedPraise } from "@/lib/llm/prompts";
import { ScriptedLlm } from "../helpers/scripted-llm";

const Schema = z.object({ n: z.number().int(), tag: z.enum(["A", "B"]) });

describe("structured LLM output", () => {
  it("extracts JSON from fences and prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":[1,2]} thanks')).toEqual({ a: [1, 2] });
    expect(() => extractJson("no json")).toThrow();
  });

  it("retries on malformed JSON and schema violations, feeding errors back", async () => {
    const llm = new ScriptedLlm(["not json at all", '{"n": 1.5, "tag": "C"}', '{"n": 2, "tag": "A"}']);
    const v = await generateStructured({ schema: Schema, system: "s", user: "u", client: llm });
    expect(v).toEqual({ n: 2, tag: "A" });
    expect(llm.calls).toHaveLength(3);
    expect(llm.calls[1]?.user).toContain("Invalid JSON");
    expect(llm.calls[2]?.user).toContain("Schema validation failed");
  });

  it("enforces semantic validators (e.g. banned praise) and fails after max attempts", async () => {
    const llm = new ScriptedLlm(['{"n": 1, "tag": "A"}']);
    await expect(
      generateStructured({ schema: Schema, system: "s", user: "u", client: llm, maxAttempts: 2, validate: () => "always wrong" }),
    ).rejects.toBeInstanceOf(StructuredOutputError);
    expect(llm.calls).toHaveLength(2);
  });

  it("detects banned praise", () => {
    expect(findBannedPraise("Great job! The tense is wrong.")).toBe("great job");
    expect(findBannedPraise("Tense shift in sentence 2.")).toBeNull();
  });
});

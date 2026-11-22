import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setLlmClientForTesting, geminiThinkingConfig } from "@/lib/llm/client";
import { explainSelection, explanationCacheKey, EXPLAIN_MAX_TOKENS } from "@/lib/explain/service";
import { POST as explainPOST } from "@/app/api/explain/route";
import { resetDb, testStream } from "../helpers/db";
import { cookieFor, req } from "../helpers/session";
import { ScriptedLlm } from "../helpers/scripted-llm";

const good = {
  coreLogic: { plainEnglish: "People said they were worried about safety.", mentalImage: "Hands raised in a meeting." },
  structure: { parts: [{ text: "Critics", role: "subject", note: "" }, { text: "have raised", role: "main verb (present perfect)", note: "" }, { text: "concerns about safety", role: "object + prepositional phrase", note: "" }], summary: "S + V + O." },
  contrastive: { vietnamese: "bày tỏ lo ngại về", nuanceVi: "Trang trọng hơn 'lo lắng'.", interferenceWarning: "Không nói 'raise concerns on'." },
  usage: { dialogue: [{ speaker: "A", line: "Any feedback?" }, { speaker: "B", line: "Yes, I'd like to raise concerns about the budget." }], textbookTrap: "raise worries for", natural: "raise concerns about", why: "Fixed collocation." },
};
const SEL = "Critics have raised concerns about safety";

describe("4-mode explainer: thinking tier & cache", () => {
  beforeEach(resetDb);
  afterAll(() => setLlmClientForTesting(null));

  it("rejects structure parts that are not in the selection and retries", async () => {
    const bad = { ...good, structure: { ...good.structure, parts: [{ text: "Opponents", role: "subject", note: "" }] } };
    const llm = new ScriptedLlm([JSON.stringify(bad), JSON.stringify(good)]);
    const out = await explainSelection(SEL, `${SEL} and maintenance.`, "B1.2", llm);
    expect(out.explanation.contrastive.vietnamese).toBe("bày tỏ lo ngại về");
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]?.user).toContain("Opponents");
  });

  it("uses the minimal thinking tier, low temperature and a tight output cap", async () => {
    const llm = new ScriptedLlm([JSON.stringify(good)]);
    await explainSelection(SEL, SEL, "B1.2", llm);
    expect(llm.calls[0]).toMatchObject({ tier: "minimal", temperature: 0.2, maxTokens: EXPLAIN_MAX_TOKENS });
    expect(EXPLAIN_MAX_TOKENS).toBeLessThanOrEqual(4000);
  });

  it("hits ExplanationCache on repeat calls (no second LLM call), keyed by selection, context and level", async () => {
    const llm = new ScriptedLlm([JSON.stringify(good)]);
    const first = await explainSelection(SEL, SEL, "B1.2", llm);
    const second = await explainSelection(`  ${SEL.toUpperCase()} `, SEL, "B1.2", llm);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.ms).toBeLessThan(100);
    expect(llm.calls).toHaveLength(1);
    expect((await prisma.explanationCache.findUniqueOrThrow({ where: { key: explanationCacheKey(SEL, SEL, "B1.2") } })).hits).toBe(1);
    // A different level is a different cache entry.
    await explainSelection(SEL, SEL, "C1.1", llm);
    expect(llm.calls).toHaveLength(2);
  });

  it("the cache is shared across streams and reported via X-Explain-Cache", async () => {
    setLlmClientForTesting(new ScriptedLlm([JSON.stringify(good)]));
    const a = await cookieFor(await testStream("000"));
    const b = await cookieFor(await testStream("001"));
    const r1 = await explainPOST(req("/api/explain", { cookie: a, body: { selection: SEL, context: SEL } }));
    const r2 = await explainPOST(req("/api/explain", { cookie: b, body: { selection: SEL, context: SEL } }));
    expect(r1.headers.get("X-Explain-Cache")).toBe("MISS");
    expect(r2.headers.get("X-Explain-Cache")).toBe("HIT");
    expect((await r2.json()).contrastive.vietnamese).toBe("bày tỏ lo ngại về");
  });

  it("maps tiers to Gemini thinking configs per model family", () => {
    expect(geminiThinkingConfig("gemini-3.5-flash", "minimal")).toMatchObject({ thinkingLevel: "MINIMAL" });
    expect(geminiThinkingConfig("gemini-3.5-flash", "thorough")).toMatchObject({ thinkingLevel: "HIGH" });
    expect(geminiThinkingConfig("gemini-2.5-flash", "minimal")).toMatchObject({ thinkingBudget: 0 });
    expect(geminiThinkingConfig("gemini-2.5-pro", "minimal")).toMatchObject({ thinkingBudget: 128 });
    expect(geminiThinkingConfig("gemini-2.5-pro", "thorough")).toMatchObject({ thinkingBudget: -1 });
  });
});

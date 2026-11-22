import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setLlmClientForTesting, type CompletionRequest } from "@/lib/llm/client";
import { startSession } from "@/lib/practice/service";
import { BEGINNER_DICTATION, BEGINNER_SPEAKING, rotatingSet } from "@/lib/practice/static-bank";
import { verifyDictation, verifySpeaking } from "@/lib/practice/content";
import { resetDb, testStream } from "../helpers/db";
import { ScriptedLlm } from "../helpers/scripted-llm";

let llmCalls = 0;
const SENTENCES = {
  items: [
    ["Tôi đã thảo luận kế hoạch mới với nhóm của tôi hôm qua.", "I discussed the new plan with my team yesterday.", ["about"]],
    ["Cô ấy rất thích nấu ăn cho cả gia đình.", "She really likes cooking for her whole family.", ["very"]],
    ["Cuối tuần trước chúng tôi đã đi xem phim ở trung tâm.", "We went to the cinema in the centre last weekend.", ["go"]],
    ["Anh ấy là một kỹ sư giỏi ở công ty lớn.", "He is a good engineer at a big company.", ["very"]],
    ["Tôi không có nhiều thời gian rảnh vào buổi sáng.", "I don't have much free time in the morning.", ["many"]],
  ].map(([vi, en, d]) => ({ vi, en, accepted: [], distractors: d, trapVi: "Bẫy dịch từng chữ." })),
};
const reply = (req: CompletionRequest) => {
  llmCalls++;
  if (req.user.includes("sentence-building") || req.system.includes("sentence-building")) return JSON.stringify(SENTENCES);
  throw new Error(`unexpected prompt ${req.system.slice(0, 60)}`);
};

async function learner(code: string, subBand: string, level: number) {
  const s = await testStream(code);
  await prisma.proficiencyProfile.create({ data: { streamId: s.id, subBand: subBand as never, ieltsEstimate: 4, ieltsLow: 3.5, ieltsHigh: 4.5, gai: 60, lri: 50, cpr: 60, rss: 0, eri: 100, composite: 58, abilityLevel: level } });
  return s;
}

describe("practice quota hygiene", () => {
  beforeEach(async () => {
    await resetDb();
    llmCalls = 0;
    setLlmClientForTesting(new ScriptedLlm([reply, reply, reply, reply]));
  });
  afterAll(() => setLlmClientForTesting(null));

  it("static beginner banks pass the same validators as LLM content", () => {
    for (let v = 0; v < 4; v++) {
      expect(verifyDictation({ items: rotatingSet(BEGINNER_DICTATION, v) }, "A1_1", 20)).toBeNull();
      expect(verifySpeaking({ items: rotatingSet(BEGINNER_SPEAKING, v) }, "A1_1")).toBeNull();
    }
    expect(rotatingSet(BEGINNER_DICTATION, 0)[0]).not.toEqual(rotatingSet(BEGINNER_DICTATION, 1)[0]);
  });

  it("Pre-A1 / A1 dictation and speaking start with ZERO LLM calls and rotate sets", async () => {
    const s = await learner("000", "PRE_A1", 5);
    const d1 = await startSession(s.id, "DICTATION", undefined, new Date());
    const d2 = await startSession(s.id, "DICTATION", undefined, new Date());
    const sp = await startSession(s.id, "SPEAKING", undefined, new Date());
    expect(llmCalls).toBe(0);
    type Items = { items: Array<{ audio?: string; ipa?: string }> };
    expect((d1 as Items).items[0]?.audio).not.toBe((d2 as Items).items[0]?.audio);
    expect((sp as Items).items[0]?.ipa?.startsWith("/")).toBe(true);
  });

  it("LLM-generated sets are cached in PracticePromptCache and reused by other streams at the same level", async () => {
    const a = await learner("000", "B1_1", 56);
    const b = await learner("001", "B1_1", 57);
    await startSession(a.id, "SENTENCE", undefined, new Date());
    expect(llmCalls).toBe(1);
    expect(await prisma.practicePromptCache.count()).toBe(1);
    await startSession(b.id, "SENTENCE", undefined, new Date());
    expect(llmCalls).toBe(1); // cache hit: zero extra calls
    expect((await prisma.practicePromptCache.findFirstOrThrow()).hits).toBe(1);
    // The cache is shared content only: it has no stream column and each stream keeps its own session row.
    expect(await prisma.practiceSession.count({ where: { streamId: a.id } })).toBe(1);
    expect(await prisma.practiceSession.count({ where: { streamId: b.id } })).toBe(1);
    // A second session for the same learner asks for a new variant (fresh set).
    await startSession(a.id, "SENTENCE", undefined, new Date());
    expect(llmCalls).toBe(2);
  });
});

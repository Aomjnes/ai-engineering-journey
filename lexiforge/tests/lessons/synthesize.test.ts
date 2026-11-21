import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setLlmClientForTesting, type CompletionRequest } from "@/lib/llm/client";
import { isStretchChunk, synthesizeLesson, verifyLessonContent } from "@/lib/lessons/synthesize";
import { profileText } from "@/lib/metrics/readability";
import { getLocalUser } from "@/lib/profile/service";
import { resetDb } from "../helpers/db";
import { ScriptedLlm } from "../helpers/scripted-llm";
import { ARTICLE_PARAGRAPHS } from "../fixtures/article";

const CONTENT = ARTICLE_PARAGRAPHS.join("\n\n");
const BRIDGE =
  "Rotterdam has a new plan for its schools. The city will turn three old harbour buildings into floating classrooms. Many schools are too full, and the city wants to fix this problem in two years. The plan will cost about 48 million euros. Some people raised concerns about safety. The buildings are on water, and big storms sometimes hit this part of the port. Parents want smaller classes, but some think the trip to school will be long. Work is expected to begin next spring.";

function reply(req: CompletionRequest): string {
  if (req.user.includes("graded bridge text")) return JSON.stringify({ bridgeText: BRIDGE });
  if (req.user.includes("Extract from the TEXT")) {
    const text = req.user.slice(req.user.lastIndexOf("TEXT:\n"));
    const isBridge = text.includes("Rotterdam has a new plan");
    const sentence = (needle: string) => (isBridge ? BRIDGE : CONTENT).split(/(?<=\.)\s+/).find((s) => s.includes(needle)) ?? "";
    const chunks = isBridge
      ? [["turn three old harbour buildings into", "turn"], ["raised concerns about", "raised concerns"], ["expected to begin", "expected to begin"], ["fix this problem", "fix this"], ["smaller classes", "smaller classes"]]
      : [["raised concerns about", "raised concerns"], ["won the support of", "won the support"], ["ease chronic overcrowding", "chronic overcrowding"], ["remain stable", "remain stable"], ["watching closely", "watching closely"], ["committing to", "committing to"]];
    return JSON.stringify({
      chunks: chunks.map(([phrase, needle]) => ({ phrase, sourceSentence: sentence(needle as string), meaningEn: "meaning", meaningVi: "nghĩa", cefrTier: "B2" })),
      grammarInWild: [
        { pattern: "Passive with expected", example: sentence(isBridge ? "expected to begin" : "Construction is expected"), explanationEn: "be expected to + verb", explanationVi: "be expected to + động từ nguyên mẫu" },
        { pattern: "Contrast with however", example: sentence(isBridge ? "Parents want" : "Critics, however"), explanationEn: "however contrasts", explanationVi: "however dùng để đối lập" },
      ],
    });
  }
  if (req.user.includes("comprehension questions")) {
    return JSON.stringify({
      questions: [
        { id: "q1", type: "inference", prompt: "Why might insurers hesitate to cover the new classrooms?", rubric: ["Mentions storm surges or flooding risk", "Links risk to insurance cost or refusal"] },
        { id: "q2", type: "paraphrase", prompt: "In your own words, what problem is the plan meant to solve?", rubric: ["States that schools are overcrowded", "Mentions the plan is cheaper than new schools"] },
        { id: "q3", type: "nuance", prompt: "How do parents feel about the plan overall?", rubric: ["Says their reaction is mixed or cautious", "Gives one reason for concern"] },
      ],
      productionPrompt: "Write a 100-word email to the council giving your view on the floating classrooms. Use at least 3 of the lesson chunks.",
    });
  }
  throw new Error(`unexpected prompt: ${req.user.slice(0, 80)}`);
}

async function seed(level: number) {
  const user = await getLocalUser();
  const feed = await prisma.sourceFeed.create({ data: { name: "Test", url: "https://example.com/rss", homepage: "https://example.com", topic: "t" } });
  const p = profileText(CONTENT);
  const article = await prisma.dailyArticle.create({
    data: {
      feedId: feed.id, urlHash: "h1", url: "https://example.com/a", title: "Floating classrooms", content: CONTENT, wordCount: p.wordCount, sentenceCount: p.sentenceCount,
      fleschKincaidGrade: p.fleschKincaidGrade, fleschReadingEase: p.fleschReadingEase, avgSentenceLength: p.avgSentenceLength, avgSyllablesPerWord: p.avgSyllablesPerWord,
      lexicalSophistication: p.lexicalSophistication, cefrTier: "B2", difficultyScore: p.difficultyScore,
    },
  });
  const subBand = level < 37.5 ? "B1_1" : "B2_1";
  const profile = await prisma.proficiencyProfile.create({
    data: { userId: user.id, subBand, ieltsEstimate: 5.5, ieltsLow: 5, ieltsHigh: 6, gai: 70, lri: 60, cpr: 70, rss: 0, eri: 100, composite: 66, abilityLevel: level },
  });
  return { user, article, profile };
}

describe("i+1 lesson synthesis", () => {
  beforeEach(async () => {
    await resetDb();
    setLlmClientForTesting(new ScriptedLlm([reply]));
  });
  afterAll(() => setLlmClientForTesting(null));

  it("serves a verified graded bridge plus the authentic excerpt for a B1.1 learner", async () => {
    const { user, article, profile } = await seed(30);
    const lesson = await synthesizeLesson(user.id, profile, article.id, new Date());
    expect(lesson.isGraded).toBe(true);
    expect(lesson.readingText).toBe(BRIDGE);
    expect(lesson.difficultyScore).toBeLessThanOrEqual(48);
    expect(lesson.authenticExcerpt).toContain("Rotterdam");
    expect(lesson.chunks.length).toBeGreaterThanOrEqual(5);
    expect(lesson.comprehensibility).toBeGreaterThan(0.7);
    // Idempotent: the same article returns the same lesson.
    expect((await synthesizeLesson(user.id, profile, article.id, new Date())).id).toBe(lesson.id);
  });

  it("serves unedited authentic text to a B2 learner and auto-picks today's article", async () => {
    const { user, profile } = await seed(58);
    const lesson = await synthesizeLesson(user.id, profile, undefined, new Date());
    expect(lesson.isGraded).toBe(false);
    expect(lesson.readingText.startsWith(ARTICLE_PARAGRAPHS[0] as string)).toBe(true);
    expect(lesson.chunks.some((c) => c.isStretch)).toBe(true);
  });

  it("rejects hallucinated chunks and single words deterministically", () => {
    const bad = verifyLessonContent(
      {
        chunks: [
          { phrase: "overcrowding", sourceSentence: ARTICLE_PARAGRAPHS[0] as string, meaningEn: "m", meaningVi: "n", cefrTier: "B2" },
          { phrase: "take into account", sourceSentence: ARTICLE_PARAGRAPHS[0] as string, meaningEn: "m", meaningVi: "n", cefrTier: "B2" },
          { phrase: "raised concerns", sourceSentence: "This sentence is not in the article at all.", meaningEn: "m", meaningVi: "n", cefrTier: "B2" },
          { phrase: "won the support", sourceSentence: "x".repeat(12), meaningEn: "m", meaningVi: "n", cefrTier: "B2" },
          { phrase: "remain stable", sourceSentence: "y".repeat(12), meaningEn: "m", meaningVi: "n", cefrTier: "B2" },
        ],
        grammarInWild: [
          { pattern: "p", example: "Invented example sentence.", explanationEn: "rule", explanationVi: "quy tắc" },
          { pattern: "q", example: "Another invented one.", explanationEn: "rule", explanationVi: "quy tắc" },
        ],
      },
      CONTENT,
    );
    expect(bad).toMatch(/single word/);
    expect(bad).toMatch(/does not occur/);
    expect(bad).toMatch(/not copied verbatim/);
    expect(bad).toMatch(/grammar example/);
    expect(isStretchChunk("chronic overcrowding")).toBe(true);
    expect(isStretchChunk("make a decision")).toBe(false);
  });
});

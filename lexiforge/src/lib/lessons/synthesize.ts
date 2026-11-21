/**
 * i+1 Lesson Synthesizer. The LLM writes bridge text and proposes chunks; deterministic code verifies
 * that every chunk/grammar example really occurs in today's text and that the bridge hits the target difficulty.
 */

import { z } from "zod";
import type { DailyArticle, LessonUnit, LexicalChunk, ProficiencyProfile } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/http";
import { generateStructured } from "@/lib/llm/structured";
import type { LlmClient } from "@/lib/llm/client";
import { JSON_ONLY } from "@/lib/llm/prompts";
import { chunkPresent } from "@/lib/evaluation/chunks";
import { comprehensibility, profileText } from "@/lib/metrics/readability";
import { bandLabel, type SubBand } from "@/lib/metrics/scoring";
import { excerptByWords, isCoreWord, tokenize } from "@/lib/metrics/text";
import { generateQuestionSet } from "./questions";
import { bridgeAccepted, deliveryMode, rankArticles, targetDifficulty } from "./match";

const LESSON_WORDS = 420;
const AUTHENTIC_EXCERPT_WORDS = 260;

const BridgeSchema = z.object({ bridgeText: z.string().min(200).max(6000) });

export const ChunkProposalSchema = z.object({
  phrase: z.string().min(3).max(60),
  sourceSentence: z.string().min(10).max(600),
  meaningEn: z.string().min(3).max(240),
  meaningVi: z.string().min(2).max(240),
  cefrTier: z.enum(["A2", "B1", "B2", "C1"]),
});

export const LessonContentSchema = z.object({
  chunks: z.array(ChunkProposalSchema).min(5).max(9),
  grammarInWild: z
    .array(z.object({ pattern: z.string().min(3).max(120), example: z.string().min(5).max(400), explanationEn: z.string().min(5).max(500), explanationVi: z.string().min(5).max(500) }))
    .min(2)
    .max(3),
});
export type LessonContent = z.infer<typeof LessonContentSchema>;

const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

/** A chunk counts as "stretch" (the +1) when it contains a word outside the core band. */
export function isStretchChunk(phrase: string): boolean {
  return tokenize(phrase).some((t) => /^[a-z]/.test(t) && t.length >= 3 && !isCoreWord(t));
}

/** Deterministic verification of LLM chunk/grammar proposals against the reading text. */
export function verifyLessonContent(content: LessonContent, readingText: string): string | null {
  const textNorm = norm(readingText);
  const problems: string[] = [];
  for (const c of content.chunks) {
    if (tokenize(c.phrase).length < 2) problems.push(`"${c.phrase}" is a single word; give multi-word chunks/collocations only`);
    else if (!textNorm.includes(norm(c.sourceSentence))) problems.push(`sourceSentence for "${c.phrase}" is not copied verbatim from the text`);
    else if (!chunkPresent(c.sourceSentence, c.phrase)) problems.push(`"${c.phrase}" does not occur in its sourceSentence`);
  }
  const phrases = content.chunks.map((c) => norm(c.phrase));
  if (new Set(phrases).size !== phrases.length) problems.push("duplicate chunks");
  for (const g of content.grammarInWild) if (!textNorm.includes(norm(g.example))) problems.push(`grammar example "${g.example.slice(0, 60)}" is not verbatim from the text`);
  const stretch = content.chunks.filter((c) => isStretchChunk(c.phrase)).length;
  if (stretch === 0) problems.push("include at least one stretch chunk containing a less-frequent word");
  if (stretch > Math.ceil(content.chunks.length * 0.6)) problems.push("too many stretch chunks; keep most chunks within reach");
  return problems.length ? `Fix: ${problems.join("; ")}.` : null;
}

async function writeBridge(excerpt: string, level: number, label: string, client?: LlmClient): Promise<{ text: string; difficulty: number; attempts: number }> {
  const target = targetDifficulty(level);
  let feedback = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const out = await generateStructured({
      schema: BridgeSchema,
      system: "You are a graded-reader editor. You rewrite authentic news faithfully: same facts, same order, no invented details, natural English (never simplistic baby-talk).",
      user: `Rewrite this authentic news excerpt as a graded bridge text for a CEFR ${label} learner (aim one step above their level: about 85–90% familiar words).
Keep every fact, name, number and the original order. Use shorter sentences (average ≤ 16 words) and common words, but KEEP 6–8 useful multi-word expressions from the original verbatim.
${feedback}
EXCERPT:
${excerpt}

OUTPUT SCHEMA: {"bridgeText": string}
${JSON_ONLY}`,
      effort: "medium",
      client,
    });
    const measured = profileText(out.bridgeText).difficultyScore;
    if (bridgeAccepted(level, measured)) return { text: out.bridgeText, difficulty: measured, attempts: attempt };
    feedback = `PREVIOUS ATTEMPT MEASURED TOO HARD (difficulty ${measured.toFixed(1)}, target ≤ ${(target + 8).toFixed(1)}): use shorter sentences and more frequent words.`;
  }
  throw new AppError(502, "BRIDGE_TOO_HARD", "Could not produce a graded version at your level after 3 attempts. Try another article.");
}

async function extractContent(readingText: string, label: string, client?: LlmClient): Promise<LessonContent> {
  return generateStructured({
    schema: LessonContentSchema,
    system: "You are an applied linguist extracting teachable lexical chunks (collocations, phrasal verbs, fixed expressions) and grammar-in-the-wild from real news. You never list isolated single words.",
    user: `Learner level: CEFR ${label}. Extract from the TEXT:
- 6–8 multi-word lexical chunks/collocations worth acquiring (e.g. "raise concerns about", "in the wake of"). Most should be just above the learner's level; 1–3 may be stretch items. Give each the exact sentence it appears in (copied verbatim), an English meaning, a natural Vietnamese equivalent, and its CEFR tier.
- 2–3 grammar-in-the-wild patterns that actually occur in the text, each with the verbatim example sentence, a concise English rule and a Vietnamese explanation that flags typical Vietnamese-speaker errors.

TEXT:
${readingText}

OUTPUT SCHEMA: {"chunks":[{"phrase","sourceSentence","meaningEn","meaningVi","cefrTier":"A2"|"B1"|"B2"|"C1"}],"grammarInWild":[{"pattern","example","explanationEn","explanationVi"}]}
${JSON_ONLY}`,
    effort: "medium",
    client,
    validate: (v) => verifyLessonContent(v, readingText),
  });
}

export type LessonWithChunks = LessonUnit & { chunks: LexicalChunk[]; article: DailyArticle };

export async function synthesizeLesson(userId: string, profile: ProficiencyProfile, articleId: string | undefined, now: Date, client?: LlmClient): Promise<LessonWithChunks> {
  const level = profile.abilityLevel;
  const label = bandLabel(profile.subBand as SubBand);
  let article: DailyArticle | null;
  if (articleId) {
    article = await prisma.dailyArticle.findUnique({ where: { id: articleId } });
    if (!article) throw new AppError(404, "ARTICLE_NOT_FOUND", "Article not found.");
  } else {
    const used = new Set((await prisma.lessonUnit.findMany({ where: { userId }, select: { articleId: true } })).map((l) => l.articleId));
    const recent = await prisma.dailyArticle.findMany({ where: { ingestedAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } } });
    article = rankArticles(recent, level, used)[0] ?? null;
    if (!article) throw new AppError(409, "NO_CONTENT", 'No unused live articles from the last 3 days. Press "Sync Live Content Now".');
  }
  const existing = await prisma.lessonUnit.findFirst({ where: { userId, articleId: article.id }, include: { chunks: true, article: true } });
  if (existing) return existing;

  const mode = deliveryMode(level, article.difficultyScore);
  const authenticExcerpt = excerptByWords(article.content, AUTHENTIC_EXCERPT_WORDS);
  const lessonSource = excerptByWords(article.content, LESSON_WORDS);
  let readingText = lessonSource;
  let difficulty = profileText(lessonSource).difficultyScore;
  if (mode === "GRADED_BRIDGE") {
    const bridge = await writeBridge(lessonSource, level, label, client);
    readingText = bridge.text;
    difficulty = bridge.difficulty;
  }
  const content = await extractContent(readingText, label, client);
  const questions = await generateQuestionSet({ text: readingText, count: 3, levelLabel: label, chunks: content.chunks.map((c) => c.phrase), client });
  const known = new Set((await prisma.srsCard.findMany({ where: { userId }, select: { front: true } })).flatMap((c) => tokenize(c.front)));

  return prisma.lessonUnit.create({
    data: {
      userId,
      articleId: article.id,
      targetSubBand: profile.subBand,
      difficultyScore: difficulty,
      isGraded: mode === "GRADED_BRIDGE",
      readingText,
      authenticExcerpt,
      comprehensibility: comprehensibility(readingText, known),
      grammarInWild: content.grammarInWild,
      questions: questions.questions,
      productionPrompt: questions.productionPrompt,
      createdAt: now,
      chunks: {
        create: content.chunks.map((c) => ({
          phrase: c.phrase,
          sourceSentence: c.sourceSentence,
          meaningEn: c.meaningEn,
          meaningVi: c.meaningVi,
          cefrTier: c.cefrTier,
          isStretch: isStretchChunk(c.phrase),
        })),
      },
    },
    include: { chunks: true, article: true },
  });
}

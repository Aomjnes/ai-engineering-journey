/**
 * The 4-Stage Active Acquisition Loop. Stages are strictly ordered and server-enforced:
 * INPUT (shadowing check) → COMPREHENSION (open questions, copy-paste rejected) →
 * PRODUCTION (≥ 3 chunks, Error-Repair Gate, forced rewrite) → EXIT_TICKET (1 sentence per chunk → SRS) → COMPLETED.
 */

import { z } from "zod";
import type { LessonStage, LessonUnit, LexicalChunk } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/http";
import { evaluateComprehension, evaluateWriting, type WritingEvaluation } from "@/lib/evaluation/evaluator";
import { guardSubmission } from "@/lib/evaluation/guard";
import { attemptCount, saveSubmission } from "@/lib/evaluation/persist";
import { buildInlineDiff } from "@/lib/evaluation/spans";
import { computeCpr, type ComprehensionItemResult } from "@/lib/metrics/scoring";
import { detectCopy, dictationAccuracy, textJaccard } from "@/lib/metrics/similarity";
import { newCard } from "@/lib/metrics/srs";
import { countWords, pickShadowSentence } from "@/lib/metrics/text";
import { recordSession, requireProfile, type SessionOutcome } from "@/lib/profile/service";
import { QuestionSchema } from "./questions";

export const SHADOW_MIN_ACCURACY = 0.8;
export const COMPREHENSION_PASS = 0.5;
export const PRODUCTION_CHUNKS_REQUIRED = 3;
export const UPGRADE_COPY_LIMIT = 0.9;
const PRODUCTION_WORDS = { minWords: 60, maxWords: 220 };

type LessonFull = LessonUnit & { chunks: LexicalChunk[] };

async function loadLesson(userId: string, lessonId: string): Promise<LessonFull> {
  const lesson = await prisma.lessonUnit.findUnique({ where: { id: lessonId }, include: { chunks: true } });
  if (!lesson || lesson.userId !== userId) throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
  return lesson;
}

function requireStage(lesson: LessonUnit, stage: LessonStage) {
  if (lesson.stage !== stage) {
    throw new AppError(409, "STAGE_ORDER", `This lesson is at stage ${lesson.stage}; ${stage} submissions are not accepted now. Stages cannot be skipped.`);
  }
}

const questionsOf = (lesson: LessonUnit) => z.array(QuestionSchema).parse(lesson.questions);

export function shadowSentenceFor(lesson: Pick<LessonUnit, "id" | "readingText">) {
  return pickShadowSentence(lesson.readingText, lesson.id);
}

// ───────────────────────────── Stage 1 — Input & shadowing ─────────────────────────────

export async function submitShadowing(userId: string, lessonId: string, transcript: string) {
  const lesson = await loadLesson(userId, lessonId);
  requireStage(lesson, "INPUT");
  const target = shadowSentenceFor(lesson);
  if (!target) throw new AppError(500, "NO_SENTENCE", "Lesson has no sentence to shadow.");
  const accuracy = dictationAccuracy(target.text, transcript);
  const passed = accuracy >= SHADOW_MIN_ACCURACY;
  if (passed) await prisma.lessonUnit.update({ where: { id: lesson.id }, data: { stage: "COMPREHENSION" } });
  return { passed, accuracy: Math.round(accuracy * 1000) / 10, required: SHADOW_MIN_ACCURACY * 100, nextStage: passed ? "COMPREHENSION" : "INPUT" };
}

// ───────────────────────────── Stage 2 — Deep comprehension ─────────────────────────────

interface ItemEvidence {
  criteriaMet: number;
  criteriaTotal: number;
  copyRejected: boolean;
  criticalLogicError: boolean;
}

const ItemEvidenceSchema = z.object({ criteriaMet: z.number(), criteriaTotal: z.number(), copyRejected: z.boolean(), criticalLogicError: z.boolean() });

export async function submitComprehension(userId: string, lessonId: string, questionId: string, answer: string) {
  const lesson = await loadLesson(userId, lessonId);
  requireStage(lesson, "COMPREHENSION");
  const question = questionsOf(lesson).find((q) => q.id === questionId);
  if (!question) throw new AppError(404, "QUESTION_NOT_FOUND", "Unknown question.");
  const already = await prisma.submissionAttempt.findFirst({ where: { lessonId, kind: "COMPREHENSION", questionId, passedGate: true } });
  if (already) throw new AppError(409, "ALREADY_PASSED", "This question is already answered correctly.");
  const guard = guardSubmission(answer, { minWords: 5, maxWords: 150 });
  if (!guard.ok) throw new AppError(422, guard.code ?? "REJECTED", guard.message ?? "Rejected.");
  const attemptNumber = (await prisma.submissionAttempt.count({ where: { lessonId, kind: "COMPREHENSION", questionId } })) + 1;
  const copy = detectCopy(answer, lesson.readingText);
  if (copy.isCopy) {
    const evidence: ItemEvidence = { criteriaMet: 0, criteriaTotal: question.rubric.length, copyRejected: true, criticalLogicError: false };
    await saveSubmission({ userId, kind: "COMPREHENSION", lessonId, questionId, text: answer, wordCount: countWords(answer), taskDifficulty: lesson.difficultyScore, attemptNumber, copySimilarity: copy.maxJaccard, rejected: true, rejectionReason: "COPY_PASTE", evidence, cpr: 0 });
    return {
      passed: false,
      copyRejected: true,
      similarity: Math.round(copy.maxJaccard * 1000) / 10,
      matchedText: copy.matchedWindow,
      message: `Rejected: ${Math.round(copy.maxJaccard * 100)}% overlap with the source (limit 65%). Answer in your own words. This attempt scores 0 for Comprehension Precision.`,
    };
  }
  const ev = await evaluateComprehension({ question: question.prompt, rubric: question.rubric, answer, sourceText: lesson.readingText });
  const score = ev.criticalLogicError ? 0 : ev.criteriaMet / ev.criteriaTotal;
  const passed = score >= COMPREHENSION_PASS;
  const evidence: ItemEvidence = { criteriaMet: ev.criteriaMet, criteriaTotal: ev.criteriaTotal, copyRejected: false, criticalLogicError: ev.criticalLogicError };
  await saveSubmission({
    userId, kind: "COMPREHENSION", lessonId, questionId, text: answer, wordCount: countWords(answer), taskDifficulty: lesson.difficultyScore, attemptNumber,
    copySimilarity: copy.maxJaccard, evidence: { ...evidence, rubric: ev.rubric, verdictEn: ev.verdictEn }, cpr: Math.round(score * 10000) / 100, passedGate: passed, errors: ev.errors,
  });
  let nextStage: LessonStage = "COMPREHENSION";
  if (passed) {
    const passedIds = new Set((await prisma.submissionAttempt.findMany({ where: { lessonId, kind: "COMPREHENSION", passedGate: true }, select: { questionId: true } })).map((s) => s.questionId));
    if (questionsOf(lesson).every((q) => passedIds.has(q.id))) {
      nextStage = "PRODUCTION";
      await prisma.lessonUnit.update({ where: { id: lesson.id }, data: { stage: nextStage } });
    }
  }
  return { passed, copyRejected: false, attemptNumber, firstAttempt: attemptNumber === 1, rubric: ev.rubric, criteriaMet: ev.criteriaMet, criteriaTotal: ev.criteriaTotal, misreadSource: ev.misreadSource, errors: ev.errors, verdictEn: ev.verdictEn, verdictVi: ev.verdictVi, nextStage };
}

/** CPR for the lesson: first attempts only (copy-paste first attempts count as 0). */
export async function lessonCpr(lessonId: string): Promise<{ cpr: number | null; items: number }> {
  const firsts = await prisma.submissionAttempt.findMany({ where: { lessonId, kind: "COMPREHENSION", attemptNumber: 1 } });
  const items: ComprehensionItemResult[] = firsts.map((s) => {
    const e = ItemEvidenceSchema.safeParse(s.evidence);
    const ev = e.success ? e.data : { criteriaMet: 0, criteriaTotal: 1, copyRejected: s.rejected, criticalLogicError: false };
    return { ...ev, firstAttempt: true };
  });
  return { cpr: computeCpr(items), items: items.length };
}

// ───────────────────────────── Stage 3 — Production + Error-Repair Gate ─────────────────────────────

function productionBlocked(ev: WritingEvaluation): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (ev.gate.blocked && ev.gate.reason) reasons.push(ev.gate.reason);
  const counted = ev.chunks.filter((c) => c.counted).length;
  if (counted < PRODUCTION_CHUNKS_REQUIRED) reasons.push(`Only ${counted} target chunk(s) used correctly; at least ${PRODUCTION_CHUNKS_REQUIRED} are required.`);
  if (ev.offPrompt) reasons.push("The text does not answer the task prompt.");
  return { blocked: reasons.length > 0, reasons };
}

function publicEvaluation(text: string, ev: WritingEvaluation, blocked: { blocked: boolean; reasons: string[] }) {
  return {
    blocked: blocked.blocked,
    reasons: blocked.reasons,
    diff: buildInlineDiff(text, ev.errors),
    errors: ev.errors,
    chunks: ev.chunks,
    metrics: { gai: ev.gai, lri: ev.lri },
    verdictEn: ev.verdictEn,
    verdictVi: ev.verdictVi,
    // The native upgrade is shown for study only; the UI renders it non-copyable and the server rejects pasted copies.
    nativeUpgrade: ev.nativeUpgrade,
  };
}

export async function submitProduction(userId: string, lessonId: string, text: string, now: Date) {
  const lesson = await loadLesson(userId, lessonId);
  requireStage(lesson, "PRODUCTION");
  const firstCount = await attemptCount({ userId, lessonId, kind: "PRODUCTION" });
  if (firstCount > 0) throw new AppError(409, "REWRITE_REQUIRED", "Your production was blocked by the Error-Repair Gate. Submit a rewrite instead.");
  const guard = guardSubmission(text, PRODUCTION_WORDS);
  if (!guard.ok) throw new AppError(422, guard.code ?? "REJECTED", guard.message ?? "Rejected.");
  const copy = detectCopy(text, lesson.readingText);
  if (copy.isCopy) throw new AppError(422, "COPY_PASTE", `Rejected: ${Math.round(copy.maxJaccard * 100)}% overlap with the article (limit 65%). Write your own text.`);
  const ev = await evaluateWriting({
    text, prompt: lesson.productionPrompt, sourceText: lesson.readingText, requiredChunks: lesson.chunks.map((c) => c.phrase), chunkRequirement: PRODUCTION_CHUNKS_REQUIRED, mode: "production",
  });
  const block = productionBlocked(ev);
  await saveSubmission({
    userId, kind: "PRODUCTION", lessonId, text, wordCount: ev.gai.words, taskDifficulty: lesson.difficultyScore, attemptNumber: 1, copySimilarity: copy.maxJaccard,
    evidence: { chunks: ev.chunks, offPrompt: ev.offPrompt, nativeUpgrade: ev.nativeUpgrade, verdictEn: ev.verdictEn, verdictVi: ev.verdictVi, blockReasons: block.reasons },
    gai: ev.gai.gai, lri: ev.lri.lri, passedGate: !block.blocked, errors: ev.errors,
  });
  // The session is scored on the FIRST attempt only; rewrites never improve the score.
  const comp = await lessonCpr(lesson.id);
  const session: SessionOutcome = await recordSession(
    userId,
    { taskDifficulty: lesson.difficultyScore, gai: ev.gai.gai, lri: ev.lri.lri, cpr: comp.cpr, passedGateFirstTry: !block.blocked, words: ev.gai.words, items: comp.items, errorsPer100W: ev.gai.rawErrorsPer100W },
    now,
  );
  if (!block.blocked) await prisma.lessonUnit.update({ where: { id: lesson.id }, data: { stage: "EXIT_TICKET" } });
  return {
    ...publicEvaluation(text, ev, block),
    nextStage: block.blocked ? "PRODUCTION" : "EXIT_TICKET",
    session: { composite: session.sessionComposite, qualified: session.qualified, levelBefore: session.levelBefore, levelAfter: session.levelAfter, promotion: session.promotion },
  };
}

/**
 * A rewrite is a pasted upgrade when it is near-identical to the model's upgrade (≥ 0.9 trigram Jaccard) AND
 * clearly closer to the upgrade than to the learner's own first draft (a genuine minimal fix stays close to the draft).
 */
export function isPastedUpgrade(rewrite: string, upgrade: string, ownDraft: string): boolean {
  const toUpgrade = textJaccard(rewrite, upgrade);
  return toUpgrade >= UPGRADE_COPY_LIMIT && toUpgrade > textJaccard(rewrite, ownDraft) + 0.1;
}

export async function submitRewrite(userId: string, lessonId: string, text: string) {
  const lesson = await loadLesson(userId, lessonId);
  requireStage(lesson, "PRODUCTION");
  const first = await prisma.submissionAttempt.findFirst({ where: { lessonId, kind: "PRODUCTION", attemptNumber: 1 } });
  if (!first) throw new AppError(409, "PRODUCTION_FIRST", "Submit your production text first.");
  const lastUpgrade = await prisma.submissionAttempt.findFirst({ where: { lessonId, kind: { in: ["PRODUCTION", "REWRITE"] }, rejected: false }, orderBy: { createdAt: "desc" } });
  const upgrade = z.object({ nativeUpgrade: z.string() }).safeParse(lastUpgrade?.evidence);
  const guard = guardSubmission(text, PRODUCTION_WORDS);
  if (!guard.ok) throw new AppError(422, guard.code ?? "REJECTED", guard.message ?? "Rejected.");
  if (upgrade.success && isPastedUpgrade(text, upgrade.data.nativeUpgrade, first.text)) {
    throw new AppError(422, "UPGRADE_COPIED", "This is the model's native upgrade, not your rewrite. Fix your own text sentence by sentence.");
  }
  const attemptNumber = (await prisma.submissionAttempt.count({ where: { lessonId, kind: "REWRITE" } })) + 2;
  const ev = await evaluateWriting({
    text, prompt: lesson.productionPrompt, sourceText: lesson.readingText, requiredChunks: lesson.chunks.map((c) => c.phrase), chunkRequirement: PRODUCTION_CHUNKS_REQUIRED, mode: "rewrite",
  });
  const block = productionBlocked(ev);
  await saveSubmission({
    userId, kind: "REWRITE", lessonId, text, wordCount: ev.gai.words, taskDifficulty: lesson.difficultyScore, attemptNumber,
    evidence: { chunks: ev.chunks, nativeUpgrade: ev.nativeUpgrade, verdictEn: ev.verdictEn, blockReasons: block.reasons },
    gai: ev.gai.gai, lri: ev.lri.lri, passedGate: !block.blocked, errors: ev.errors,
  });
  if (!block.blocked) await prisma.lessonUnit.update({ where: { id: lesson.id }, data: { stage: "EXIT_TICKET" } });
  return { ...publicEvaluation(text, ev, block), attemptNumber, nextStage: block.blocked ? "PRODUCTION" : "EXIT_TICKET" };
}

// ───────────────────────────── Stage 4 — Exit ticket & SRS lock-in ─────────────────────────────

export async function submitExitTicket(userId: string, lessonId: string, sentences: Array<{ chunkId: string; text: string }>, now: Date) {
  const lesson = await loadLesson(userId, lessonId);
  requireStage(lesson, "EXIT_TICKET");
  const lockedIn = new Set((await prisma.srsCard.findMany({ where: { userId, chunk: { lessonId } }, select: { chunkId: true } })).map((c) => c.chunkId));
  const pending = lesson.chunks.filter((c) => !lockedIn.has(c.id));
  const items = pending.map((chunk) => ({ chunk, text: sentences.find((s) => s.chunkId === chunk.id)?.text.trim() ?? "" }));
  const missing = items.filter((i) => countWords(i.text) < 5);
  if (missing.length) throw new AppError(422, "INCOMPLETE", `Write one original sentence (≥ 5 words) for each chunk: ${missing.map((m) => `"${m.chunk.phrase}"`).join(", ")}.`);

  const results: Array<{ chunkId: string; phrase: string; passed: boolean; reason: string | null }> = [];
  const toGrade: typeof items = [];
  for (const it of items) {
    const copy = Math.max(detectCopy(it.text, it.chunk.sourceSentence).maxJaccard, detectCopy(it.text, lesson.readingText).maxJaccard);
    if (copy > 0.65) results.push({ chunkId: it.chunk.id, phrase: it.chunk.phrase, passed: false, reason: "Copied from the article. Write an original real-world sentence." });
    else toGrade.push(it);
  }
  let errorsOut: WritingEvaluation["errors"] = [];
  if (toGrade.length) {
    // One evaluation call for all sentences; spans are mapped back per line deterministically.
    const lines = toGrade.map((t) => t.text.replace(/\s+/g, " "));
    const joined = lines.join("\n");
    const ev = await evaluateWriting({ text: joined, prompt: "Write one original, real-world sentence for each target chunk (one per line).", requiredChunks: toGrade.map((t) => t.chunk.phrase), mode: "exit" });
    errorsOut = ev.errors;
    let offset = 0;
    toGrade.forEach((t, idx) => {
      const line = lines[idx] as string;
      const start = offset;
      const end = offset + line.length;
      offset = end + 1;
      const lineErrors = ev.errors.filter((e) => e.start >= start && e.end <= end);
      const blocking = lineErrors.filter((e) => e.severity !== "MINOR");
      const usage = ev.chunks.find((c) => c.chunk === t.chunk.phrase);
      const reason = !usage?.present
        ? `"${t.chunk.phrase}" is not in your sentence.`
        : !usage.llmUsedCorrectly
          ? `"${t.chunk.phrase}" is used incorrectly: ${usage.note}`
          : blocking.length
            ? `Fix: ${blocking.map((e) => `"${e.original}" → "${e.correction}"`).join("; ")}`
            : null;
      results.push({ chunkId: t.chunk.id, phrase: t.chunk.phrase, passed: reason === null, reason });
    });
    await saveSubmission({ userId, kind: "EXIT_TICKET", lessonId, text: joined, wordCount: countWords(joined), taskDifficulty: lesson.difficultyScore, gai: ev.gai.gai, lri: ev.lri.lri, passedGate: results.every((r) => r.passed), errors: ev.errors });
  }
  const passed = results.filter((r) => r.passed);
  for (const r of passed) {
    const chunk = lesson.chunks.find((c) => c.id === r.chunkId);
    const sentence = items.find((i) => i.chunk.id === r.chunkId)?.text ?? "";
    if (!chunk) continue;
    const card = newCard(now);
    await prisma.srsCard.create({
      data: { userId, chunkId: chunk.id, front: chunk.phrase, back: JSON.stringify({ meaningVi: chunk.meaningVi, meaningEn: chunk.meaningEn, sentence }), stability: card.stability, difficulty: card.difficulty, state: card.state, dueAt: card.dueAt, createdAt: now },
    });
  }
  const remaining = pending.length - passed.length;
  if (remaining === 0) {
    await prisma.$transaction([
      prisma.lessonUnit.update({ where: { id: lesson.id }, data: { stage: "COMPLETED", completedAt: now } }),
      prisma.userProgress.upsert({ where: { userId }, update: { lessonsCompleted: { increment: 1 }, lastLessonAt: now }, create: { userId, lessonsCompleted: 1, lastLessonAt: now } }),
    ]);
  }
  return { results, errors: errorsOut, remaining, nextStage: remaining === 0 ? "COMPLETED" : "EXIT_TICKET" };
}

/** Lesson payload for the workspace. Rubrics and model answers are never sent. */
export async function lessonView(userId: string, lessonId: string) {
  await requireProfile(userId);
  const lesson = await prisma.lessonUnit.findUnique({ where: { id: lessonId }, include: { chunks: true, article: { include: { feed: { select: { name: true } } } } } });
  if (!lesson || lesson.userId !== userId) throw new AppError(404, "LESSON_NOT_FOUND", "Lesson not found.");
  const subs = await prisma.submissionAttempt.findMany({ where: { lessonId }, orderBy: { createdAt: "asc" }, include: { errors: true } });
  const cards = await prisma.srsCard.findMany({ where: { userId, chunk: { lessonId } }, select: { chunkId: true } });
  const shadow = shadowSentenceFor(lesson);
  return {
    id: lesson.id,
    stage: lesson.stage,
    isGraded: lesson.isGraded,
    difficulty: lesson.difficultyScore,
    comprehensibility: lesson.comprehensibility,
    readingText: lesson.readingText,
    authenticExcerpt: lesson.authenticExcerpt,
    article: { title: lesson.article.title, url: lesson.article.url, source: lesson.article.feed.name, publishedAt: lesson.article.publishedAt, cefrTier: lesson.article.cefrTier, difficulty: lesson.article.difficultyScore },
    chunks: lesson.chunks.map((c) => ({ id: c.id, phrase: c.phrase, sourceSentence: c.sourceSentence, meaningEn: c.meaningEn, meaningVi: c.meaningVi, cefrTier: c.cefrTier, isStretch: c.isStretch, lockedIn: cards.some((k) => k.chunkId === c.id) })),
    grammarInWild: lesson.grammarInWild,
    questions: questionsOf(lesson).map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, passed: subs.some((s) => s.kind === "COMPREHENSION" && s.questionId === q.id && s.passedGate) })),
    productionPrompt: lesson.productionPrompt,
    shadowSentence: shadow?.text ?? null,
    production: subs
      .filter((s) => s.kind === "PRODUCTION" || s.kind === "REWRITE")
      .map((s) => ({ kind: s.kind, text: s.text, attemptNumber: s.attemptNumber, passedGate: s.passedGate, gai: s.gai, lri: s.lri, createdAt: s.createdAt })),
  };
}

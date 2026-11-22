import { z } from "zod";
import type { CefrSubBand, DiagnosticAssessment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/http";
import { evaluateComprehension, evaluateWriting } from "@/lib/evaluation/evaluator";
import { guardSubmission } from "@/lib/evaluation/guard";
import { saveSubmission } from "@/lib/evaluation/persist";
import { generateQuestionSet, QuestionSchema } from "@/lib/lessons/questions";
import { bandLabel, bandLowerBound, BAND_WIDTH, compositeScore, computeCpr, nextBand, promotionAuditPasses, QUALIFYING_THRESHOLD, SUB_BANDS, type SubBand } from "@/lib/metrics/scoring";
import { detectCopy } from "@/lib/metrics/similarity";
import { countWords, excerptByWords } from "@/lib/metrics/text";
import { applyPromotionAudit, createProfileFromPlacement, requireProfile } from "@/lib/profile/service";
import { WRITING_MAX_WORDS, WRITING_MIN_WORDS } from "./item-bank";
import { answerErrorItem, answerReading, computePlacementResult, initPlacement, PlacementFlowError, PlacementStateSchema, publicItem, type PlacementState } from "./placement";

const dayOfYear = (d: Date) => Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);

function readState(a: DiagnosticAssessment): PlacementState {
  const parsed = PlacementStateSchema.safeParse(a.itemsJson);
  if (!parsed.success) throw new AppError(500, "DIAGNOSTIC_CORRUPT", "Stored placement state is invalid; start a new audit.");
  return parsed.data;
}

async function activePlacement(streamId: string) {
  return prisma.diagnosticAssessment.findFirst({ where: { streamId, kind: "PLACEMENT", status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" } });
}

export async function placementStatus(streamId: string) {
  const a = await activePlacement(streamId);
  if (!a) return null;
  const state = readState(a);
  return { assessmentId: a.id, part: state.part, item: publicItem(state) };
}

export async function startPlacement(streamId: string, now: Date) {
  const existing = await placementStatus(streamId);
  if (existing) return existing;
  const state = initPlacement(dayOfYear(now));
  const a = await prisma.diagnosticAssessment.create({ data: { streamId, kind: "PLACEMENT", itemsJson: state, startedAt: now } });
  return { assessmentId: a.id, part: state.part, item: publicItem(state) };
}

async function loadOwned(streamId: string, assessmentId: string, kind: "PLACEMENT" | "PROMOTION") {
  const a = await prisma.diagnosticAssessment.findFirst({ where: { id: assessmentId, streamId } });
  if (!a || a.streamId !== streamId || a.kind !== kind) throw new AppError(404, "NOT_FOUND", "Assessment not found.");
  if (a.status !== "IN_PROGRESS") throw new AppError(409, "ALREADY_COMPLETED", "This assessment is already finished.");
  return a;
}

export async function answerPlacement(streamId: string, assessmentId: string, answer: { itemId: string; choices?: number[]; choice?: number }) {
  const a = await loadOwned(streamId, assessmentId, "PLACEMENT");
  let state = readState(a);
  try {
    if (state.part === "READING") state = answerReading(state, answer.itemId, answer.choices ?? []);
    else if (state.part === "ERRORS") state = answerErrorItem(state, answer.itemId, answer.choice ?? -1);
    else throw new AppError(409, "WRONG_PART", "The objective parts are finished; submit the writing sample.");
  } catch (e) {
    if (e instanceof PlacementFlowError) throw new AppError(409, e.code, e.message);
    throw e;
  }
  await prisma.diagnosticAssessment.update({ where: { id: a.id, streamId }, data: { itemsJson: state } });
  return { assessmentId: a.id, part: state.part, item: publicItem(state) };
}

export async function submitPlacementWriting(streamId: string, assessmentId: string, text: string, now: Date) {
  const a = await loadOwned(streamId, assessmentId, "PLACEMENT");
  const state = readState(a);
  if (state.part !== "WRITING") throw new AppError(409, "WRONG_PART", "Finish the reading and error-detection parts first.");
  const guard = guardSubmission(text, { minWords: WRITING_MIN_WORDS, maxWords: WRITING_MAX_WORDS });
  if (!guard.ok) throw new AppError(422, guard.code ?? "REJECTED", guard.message ?? "Submission rejected.");
  const evaluation = await evaluateWriting({ text, prompt: state.writingPrompt, requiredChunks: [], mode: "diagnostic" });
  const words = countWords(text);
  const result = computePlacementResult(state, { gai: evaluation.gai.gai, lri: evaluation.lri.lri, words });
  await saveSubmission({
    streamId,
    kind: "DIAGNOSTIC_WRITING",
    diagnosticId: a.id,
    text,
    wordCount: words,
    taskDifficulty: result.level,
    evidence: { verdictEn: evaluation.verdictEn, verdictVi: evaluation.verdictVi, nativeUpgrade: evaluation.nativeUpgrade, offPrompt: evaluation.offPrompt },
    gai: evaluation.gai.gai,
    lri: evaluation.lri.lri,
    passedGate: !evaluation.gate.blocked,
    errors: evaluation.errors,
  });
  const profile = await createProfileFromPlacement(streamId, result, now);
  await prisma.diagnosticAssessment.update({
    where: { id: a.id, streamId },
    data: {
      status: "COMPLETED",
      itemsJson: { ...state, part: "DONE", currentId: null },
      readingScore: result.readingAccuracy,
      errorScore: result.errorAccuracy,
      writingGai: result.gai,
      writingLri: result.lri,
      resultBand: result.subBand as CefrSubBand,
      resultIelts: result.ielts.band,
      completedAt: now,
    },
  });
  const weaknesses = await prisma.errorLog.groupBy({
    by: ["subtype"],
    where: { streamId },
    _count: { subtype: true },
    orderBy: { _count: { subtype: "desc" } },
    take: 5,
  });
  return {
    report: {
      subBand: bandLabel(result.subBand),
      ielts: result.ielts,
      level: result.level,
      parts: {
        reading: { theta: result.readingTheta, accuracy: result.readingAccuracy },
        errorDetection: { theta: result.errorTheta, accuracy: result.errorAccuracy, missedTraps: result.missedTraps },
        writing: { level: result.writingLevel, gai: evaluation.gai, lri: evaluation.lri },
      },
      metrics: { gai: profile.gai, lri: profile.lri, cpr: profile.cpr, rss: null, eri: null, composite: profile.composite },
      topWeaknesses: [...weaknesses.map((w) => w.subtype), ...result.missedTraps].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 5),
      writingFeedback: { errors: evaluation.errors, verdictEn: evaluation.verdictEn, verdictVi: evaluation.verdictVi, nativeUpgrade: evaluation.nativeUpgrade },
    },
  };
}

// ───────────────────────────── Band Promotion Audit ─────────────────────────────

const PromotionStateSchema = z.object({
  version: z.literal(1),
  targetBand: z.enum(SUB_BANDS),
  articleId: z.string(),
  difficulty: z.number(),
  excerpt: z.string(),
  questions: z.array(QuestionSchema),
  writingPrompt: z.string(),
});

const MIN_AUDIT_WORDS = 250;

export async function startPromotionAudit(streamId: string, now: Date) {
  const profile = await requireProfile(streamId);
  const active = await prisma.diagnosticAssessment.findFirst({ where: { streamId, kind: "PROMOTION", status: "IN_PROGRESS" } });
  if (active) {
    const st = PromotionStateSchema.parse(active.itemsJson);
    return { assessmentId: active.id, targetBand: bandLabel(st.targetBand), excerpt: st.excerpt, questions: st.questions.map(({ id, prompt }) => ({ id, prompt })), writingPrompt: st.writingPrompt };
  }
  if (!profile.promotionAuditUnlocked) throw new AppError(403, "PROMOTION_LOCKED", "The Band Promotion Audit is locked until every promotion condition is met.");
  const target = nextBand(profile.subBand as SubBand);
  if (!target) throw new AppError(409, "AT_CEILING", "C1.2 is the top tracked sub-band.");
  const lo = bandLowerBound(target);
  const candidates = await prisma.dailyArticle.findMany({
    where: { difficultyScore: { gte: lo, lte: lo + BAND_WIDTH * 1.5 }, ingestedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } },
    orderBy: { ingestedAt: "desc" },
    take: 30,
  });
  const article = candidates.filter((c) => c.wordCount >= MIN_AUDIT_WORDS).sort((a, b) => Math.abs(a.difficultyScore - (lo + 6.25)) - Math.abs(b.difficultyScore - (lo + 6.25)))[0];
  if (!article) throw new AppError(409, "NO_AUDIT_CONTENT", `No ingested article at ${bandLabel(target)} difficulty in the last 14 days. Run "Sync Live Content Now" and retry.`);
  const excerpt = excerptByWords(article.content, 320);
  const set = await generateQuestionSet({ text: excerpt, count: 3, levelLabel: bandLabel(target), chunks: [] });
  const state = { version: 1 as const, targetBand: target, articleId: article.id, difficulty: article.difficultyScore, excerpt, questions: set.questions, writingPrompt: set.productionPrompt };
  const a = await prisma.diagnosticAssessment.create({ data: { streamId, kind: "PROMOTION", targetBand: target as CefrSubBand, itemsJson: state, startedAt: now } });
  return { assessmentId: a.id, targetBand: bandLabel(target), excerpt, questions: set.questions.map(({ id, prompt }) => ({ id, prompt })), writingPrompt: set.productionPrompt };
}

export async function submitPromotionAudit(streamId: string, assessmentId: string, answers: Array<{ questionId: string; text: string }>, writing: string, now: Date) {
  const a = await loadOwned(streamId, assessmentId, "PROMOTION");
  const st = PromotionStateSchema.parse(a.itemsJson);
  const missing = st.questions.filter((q) => !answers.some((x) => x.questionId === q.id && x.text.trim().length > 0));
  if (missing.length) throw new AppError(422, "INCOMPLETE", `Answer every question (${missing.map((m) => m.id).join(", ")} missing).`);
  const wGuard = guardSubmission(writing, { minWords: 60, maxWords: 220 });
  if (!wGuard.ok) throw new AppError(422, wGuard.code ?? "REJECTED", `Writing: ${wGuard.message}`);

  const items = [];
  const comprehension = [];
  for (const q of st.questions) {
    const text = answers.find((x) => x.questionId === q.id)?.text ?? "";
    const g = guardSubmission(text, { minWords: 5, maxWords: 150 });
    if (!g.ok) throw new AppError(422, g.code ?? "REJECTED", `${q.id}: ${g.message}`);
    const copy = detectCopy(text, st.excerpt);
    if (copy.isCopy) {
      items.push({ criteriaMet: 0, criteriaTotal: q.rubric.length, copyRejected: true, criticalLogicError: false, firstAttempt: true });
      comprehension.push({ questionId: q.id, copyRejected: true, similarity: copy.maxJaccard });
      continue;
    }
    const ev = await evaluateComprehension({ question: q.prompt, rubric: q.rubric, answer: text, sourceText: st.excerpt });
    items.push({ criteriaMet: ev.criteriaMet, criteriaTotal: ev.criteriaTotal, copyRejected: false, criticalLogicError: ev.criticalLogicError, firstAttempt: true });
    comprehension.push({ questionId: q.id, copyRejected: false, rubric: ev.rubric, verdictEn: ev.verdictEn });
  }
  const cpr = computeCpr(items) ?? 0;
  const w = await evaluateWriting({ text: writing, prompt: st.writingPrompt, sourceText: st.excerpt, requiredChunks: [], mode: "diagnostic" });
  const auditComposite = compositeScore({ gai: w.gai.gai, lri: w.lri.lri, cpr, rss: null, eri: null }) ?? 0;
  const critical = w.errors.filter((e) => e.severity === "CRITICAL").length + items.filter((i) => i.criticalLogicError).length;
  const passed = promotionAuditPasses(st.targetBand, auditComposite, critical);
  await saveSubmission({
    streamId,
    kind: "PROMOTION_AUDIT",
    diagnosticId: a.id,
    text: writing,
    wordCount: countWords(writing),
    taskDifficulty: st.difficulty,
    gai: w.gai.gai,
    lri: w.lri.lri,
    cpr,
    passedGate: passed,
    evidence: { comprehension, verdictEn: w.verdictEn, verdictVi: w.verdictVi },
    errors: w.errors,
  });
  await prisma.diagnosticAssessment.update({
    where: { id: a.id, streamId },
    data: { status: "COMPLETED", readingScore: cpr, writingGai: w.gai.gai, writingLri: w.lri.lri, passed, resultBand: passed ? (st.targetBand as CefrSubBand) : undefined, completedAt: now },
  });
  const profile = await applyPromotionAudit(streamId, passed, st.targetBand, now);
  return {
    passed,
    targetBand: bandLabel(st.targetBand),
    currentBand: bandLabel(profile.subBand as SubBand),
    auditComposite,
    requiredComposite: QUALIFYING_THRESHOLD[st.targetBand],
    criticalErrors: critical,
    cpr,
    gai: w.gai,
    lri: w.lri,
    comprehension,
    writing: { errors: w.errors, verdictEn: w.verdictEn, verdictVi: w.verdictVi },
  };
}

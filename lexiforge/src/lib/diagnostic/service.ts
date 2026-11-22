import { z } from "zod";
import type { CefrSubBand, DiagnosticAssessment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/http";
import { evaluateComprehension, evaluateWriting } from "@/lib/evaluation/evaluator";
import { guardSubmission } from "@/lib/evaluation/guard";
import { saveSubmission } from "@/lib/evaluation/persist";
import { streamAudience } from "@/lib/i18n/server";
import { generateQuestionSet, QuestionSchema } from "@/lib/lessons/questions";
import { writeBridge, writeMicroStory } from "@/lib/lessons/synthesize";
import { profileText } from "@/lib/metrics/readability";
import {
  bandLabel,
  bandLowerBound,
  bandMidpoint,
  bandUpperBound,
  bandWidth,
  compositeScore,
  computeCpr,
  isBeginnerBand,
  nextBand,
  promotionAuditPasses,
  QUALIFYING_THRESHOLD,
  SUB_BANDS,
  type SubBand,
} from "@/lib/metrics/scoring";
import { detectCopy } from "@/lib/metrics/similarity";
import { countWords, excerptByWords } from "@/lib/metrics/text";
import { applyPromotionAudit, createProfileFromPlacement, requireProfile } from "@/lib/profile/service";
import { parseTarget, setGoal, syncRoadmap } from "@/lib/roadmap/service";
import { ERROR_ITEMS, WRITING_TASKS } from "./item-bank";
import { answerUnit, computePlacementResult, initPlacement, PlacementFlowError, PlacementStateSchema, publicItem, skipWriting, type Answer, type PlacementState, type Tier } from "./placement";

function readState(a: DiagnosticAssessment): PlacementState {
  const parsed = PlacementStateSchema.safeParse(a.itemsJson);
  if (!parsed.success) throw new AppError(409, "DIAGNOSTIC_OUTDATED", "This placement audit was started with an older version. Start a new one.");
  return parsed.data;
}

async function activePlacement(streamId: string) {
  return prisma.diagnosticAssessment.findFirst({ where: { streamId, kind: "PLACEMENT", status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" } });
}

const view = (a: DiagnosticAssessment, s: PlacementState) => ({ assessmentId: a.id, phase: s.phase, tier: s.tier, item: publicItem(s) });

export async function placementStatus(streamId: string) {
  const a = await activePlacement(streamId);
  if (!a) return null;
  const parsed = PlacementStateSchema.safeParse(a.itemsJson);
  if (!parsed.success) {
    // Audits started before the staircase redesign cannot be resumed; abandon them cleanly.
    await prisma.diagnosticAssessment.update({ where: { id: a.id, streamId }, data: { status: "ABANDONED" } });
    return null;
  }
  return view(a, parsed.data);
}

export const SetupSchema = z.object({
  comfortTier: z.number().int().min(0).max(3),
  targetSubBand: z.string(),
  dailyMinutes: z.number().int(),
});

/** Step 0: goal + starting comfort, then the placement audit starts at the chosen tier. */
export async function setupAndStartPlacement(streamId: string, input: z.infer<typeof SetupSchema>, now: Date) {
  const target = parseTarget(input.targetSubBand);
  await setGoal(streamId, { targetSubBand: target, dailyMinutes: input.dailyMinutes, startComfort: input.comfortTier, targetLabel: bandLabel(target) }, now);
  const existing = await activePlacement(streamId);
  if (existing) await prisma.diagnosticAssessment.update({ where: { id: existing.id, streamId }, data: { status: "ABANDONED" } });
  const state = initPlacement(input.comfortTier as Tier);
  const a = await prisma.diagnosticAssessment.create({ data: { streamId, kind: "PLACEMENT", itemsJson: state, startedAt: now } });
  return view(a, state);
}

async function loadOwned(streamId: string, assessmentId: string, kind: "PLACEMENT" | "PROMOTION") {
  const a = await prisma.diagnosticAssessment.findFirst({ where: { id: assessmentId, streamId } });
  if (!a || a.kind !== kind) throw new AppError(404, "NOT_FOUND", "Assessment not found.");
  if (a.status !== "IN_PROGRESS") throw new AppError(409, "ALREADY_COMPLETED", "This assessment is already finished.");
  return a;
}

export const AnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skip") }),
  z.object({ kind: z.literal("choice"), choice: z.number().int().min(0).max(4) }),
  z.object({ kind: z.literal("choices"), choices: z.array(z.number().int().min(0).max(3)).min(1).max(4) }),
  z.object({ kind: z.literal("order"), words: z.array(z.string().max(40)).min(1).max(12) }),
]);

export async function answerPlacement(streamId: string, assessmentId: string, unitId: string, answer: Answer, now: Date) {
  const a = await loadOwned(streamId, assessmentId, "PLACEMENT");
  let state = readState(a);
  try {
    state = answerUnit(state, unitId, answer);
  } catch (e) {
    if (e instanceof PlacementFlowError) throw new AppError(409, e.code, e.message);
    throw e;
  }
  await prisma.diagnosticAssessment.update({ where: { id: a.id, streamId }, data: { itemsJson: state } });
  if (state.phase === "DONE") return { ...view(a, state), report: await finalize(streamId, a, state, null, now) };
  return view(a, state);
}

export async function submitPlacementWriting(streamId: string, assessmentId: string, text: string, now: Date) {
  const a = await loadOwned(streamId, assessmentId, "PLACEMENT");
  const state = readState(a);
  if (state.phase !== "WRITING" || !state.writingTier) throw new AppError(409, "WRONG_PART", "Finish the objective parts first.");
  const task = WRITING_TASKS[state.writingTier as 1 | 2 | 3];
  const guard = guardSubmission(text, { minWords: task.minWords, maxWords: task.maxWords });
  if (!guard.ok) throw new AppError(422, guard.code ?? "REJECTED", guard.message ?? "Submission rejected.");
  const audience = await streamAudience(streamId);
  const evaluation = await evaluateWriting({ text, prompt: task.promptEn, requiredChunks: [], mode: "diagnostic", audience: { ...audience, beginner: state.writingTier === 1 } });
  const words = countWords(text);
  await saveSubmission({
    streamId,
    kind: "DIAGNOSTIC_WRITING",
    diagnosticId: a.id,
    text,
    wordCount: words,
    taskDifficulty: (task.levelRange[0] + task.levelRange[1]) / 2,
    evidence: { verdictEn: evaluation.verdictEn, verdictVi: evaluation.verdictVi, nativeUpgrade: evaluation.nativeUpgrade, offPrompt: evaluation.offPrompt },
    gai: evaluation.gai.gai,
    lri: evaluation.lri.lri,
    passedGate: !evaluation.gate.blocked,
    errors: evaluation.errors,
  });
  const done: PlacementState = { ...state, phase: "DONE" };
  await prisma.diagnosticAssessment.update({ where: { id: a.id, streamId }, data: { itemsJson: done } });
  return { ...view(a, done), report: await finalize(streamId, a, done, { gai: evaluation.gai.gai, lri: evaluation.lri.lri, words, evaluation }, now) };
}

export async function skipPlacementWriting(streamId: string, assessmentId: string, now: Date) {
  const a = await loadOwned(streamId, assessmentId, "PLACEMENT");
  let state = readState(a);
  try {
    state = skipWriting(state);
  } catch (e) {
    if (e instanceof PlacementFlowError) throw new AppError(409, e.code, e.message);
    throw e;
  }
  await prisma.diagnosticAssessment.update({ where: { id: a.id, streamId }, data: { itemsJson: state } });
  return { ...view(a, state), report: await finalize(streamId, a, state, null, now) };
}

type WritingOutcome = { gai: number; lri: number; words: number; evaluation: Awaited<ReturnType<typeof evaluateWriting>> } | null;

/** Section strengths (accuracy ≥ 0.7) and weaknesses (< 0.5) as stable codes; the UI localizes them. */
function sectionProfile(state: PlacementState) {
  const sections: Record<string, { correct: number; total: number }> = {};
  for (const r of state.responses) {
    const item = r.section === "T0" ? r.itemId.split("-")[1]?.[0] : r.section;
    const key = r.section === "T0" ? (item === "a" ? "LISTENING_WORDS" : item === "p" ? "SURVIVAL_PHRASES" : "WORD_ORDER") : r.section === "READING" ? "READING" : "ERROR_SPOTTING";
    const s = (sections[key] ??= { correct: 0, total: 0 });
    s.total++;
    if (r.correct) s.correct++;
  }
  const strengths = Object.entries(sections).filter(([, v]) => v.total > 0 && v.correct / v.total >= 0.7).map(([k]) => k);
  const weak = Object.entries(sections).filter(([, v]) => v.total > 0 && v.correct / v.total < 0.5).map(([k]) => k);
  return { sections, strengths, weak };
}

async function finalize(streamId: string, a: DiagnosticAssessment, state: PlacementState, writing: WritingOutcome, now: Date) {
  const trapOf = (id: string) => ERROR_ITEMS.find((e) => e.id === id)?.trap;
  const result = computePlacementResult(state, writing ? { gai: writing.gai, lri: writing.lri, words: writing.words } : null, trapOf);
  const profile = await createProfileFromPlacement(streamId, result, now);
  await setGoal(streamId, { startSubBand: result.subBand }, now);
  await syncRoadmap(streamId, now);
  await prisma.diagnosticAssessment.update({
    where: { id: a.id, streamId },
    data: {
      status: "COMPLETED",
      readingScore: result.readingAccuracy,
      errorScore: result.objectiveAccuracy,
      writingGai: result.gai,
      writingLri: result.lri,
      resultBand: result.subBand as CefrSubBand,
      resultIelts: result.ielts.band,
      completedAt: now,
    },
  });
  const sp = sectionProfile(state);
  const writingSubtypes = writing ? [...new Set(writing.evaluation.errors.filter((e) => e.severity !== "MINOR").map((e) => e.subtype))] : [];
  const blockers = [...writingSubtypes, ...result.missedTraps, ...sp.weak].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 3);
  const strengths = [...sp.strengths, ...(writing && writing.gai >= 70 ? ["WRITING_ACCURACY"] : []), ...(writing && writing.lri >= 65 ? ["WRITING_VOCABULARY"] : [])].slice(0, 4);
  return {
    subBand: result.subBand,
    subBandLabel: bandLabel(result.subBand),
    ielts: result.ielts,
    level: result.level,
    stoppedEarly: result.stoppedEarly,
    skipped: result.skipped,
    tierAccuracy: result.tierAccuracy,
    sections: sp.sections,
    strengths,
    blockers,
    metrics: { gai: result.gai, lri: result.lri, cpr: profile.cpr, composite: profile.composite },
    writingFeedback: writing ? { errors: writing.evaluation.errors, verdictEn: writing.evaluation.verdictEn, verdictVi: writing.evaluation.verdictVi } : null,
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
  writingPromptVi: z.string().optional(),
  beginner: z.boolean().optional(),
});

const MIN_AUDIT_WORDS = 250;
const NEWS_FLOOR = 45; // ingested news is never easier than this on the level scale

const auditView = (id: string, st: z.infer<typeof PromotionStateSchema>) => ({
  assessmentId: id,
  targetBand: bandLabel(st.targetBand),
  excerpt: st.excerpt,
  questions: st.questions.map(({ id: qid, prompt, promptVi }) => ({ id: qid, prompt, promptVi: promptVi ?? null })),
  writingPrompt: st.writingPrompt,
  writingPromptVi: st.writingPromptVi ?? null,
  beginner: !!st.beginner,
  writingWords: st.beginner ? { min: 8, max: 60 } : { min: 60, max: 220 },
});

export async function startPromotionAudit(streamId: string, now: Date) {
  const profile = await requireProfile(streamId);
  const active = await prisma.diagnosticAssessment.findFirst({ where: { streamId, kind: "PROMOTION", status: "IN_PROGRESS" } });
  if (active) return auditView(active.id, PromotionStateSchema.parse(active.itemsJson));
  if (!profile.promotionAuditUnlocked) throw new AppError(403, "PROMOTION_LOCKED", "The Band Promotion Audit is locked until every promotion condition is met.");
  const target = nextBand(profile.subBand as SubBand);
  if (!target) throw new AppError(409, "AT_CEILING", "C1.2 is the top tracked sub-band.");
  const lo = bandLowerBound(target);
  const beginner = isBeginnerBand(target);
  let article;
  let excerpt: string;
  let difficulty: number;
  if (lo + bandWidth(target) <= NEWS_FLOOR) {
    // Beginner/A2 targets: no real article is that easy — grade today's real news down to the target band.
    article = await prisma.dailyArticle.findFirst({ where: { ingestedAt: { gte: new Date(now.getTime() - 3 * 86_400_000) }, wordCount: { gte: MIN_AUDIT_WORDS } }, orderBy: { difficultyScore: "asc" } });
    if (!article) throw new AppError(409, "NO_AUDIT_CONTENT", 'No live articles from the last 3 days. Press "Sync now" and retry.');
    const source = excerptByWords(article.content, 320);
    const centre = bandMidpoint(target) - 10; // writers target level + 10
    excerpt = beginner ? (await writeMicroStory(source, article.title, centre)).story : (await writeBridge(source, centre, bandLabel(target))).text;
    difficulty = profileText(excerpt).difficultyScore;
  } else {
    const candidates = await prisma.dailyArticle.findMany({
      where: { difficultyScore: { gte: lo, lte: bandUpperBound(target) + bandWidth(target) / 2 }, ingestedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } },
      orderBy: { ingestedAt: "desc" },
      take: 30,
    });
    article = candidates.filter((c) => c.wordCount >= MIN_AUDIT_WORDS).sort((a, b) => Math.abs(a.difficultyScore - bandMidpoint(target)) - Math.abs(b.difficultyScore - bandMidpoint(target)))[0];
    if (!article) throw new AppError(409, "NO_AUDIT_CONTENT", `No ingested article at ${bandLabel(target)} difficulty in the last 14 days. Press "Sync now" and retry.`);
    excerpt = excerptByWords(article.content, 320);
    difficulty = article.difficultyScore;
  }
  const set = await generateQuestionSet({ text: excerpt, count: beginner ? 2 : 3, levelLabel: bandLabel(target), chunks: [], beginner });
  const state = { version: 1 as const, targetBand: target, articleId: article.id, difficulty, excerpt, questions: set.questions, writingPrompt: set.productionPrompt, writingPromptVi: set.productionPromptVi, beginner };
  const a = await prisma.diagnosticAssessment.create({ data: { streamId, kind: "PROMOTION", targetBand: target as CefrSubBand, itemsJson: state, startedAt: now } });
  return auditView(a.id, state);
}

export async function submitPromotionAudit(streamId: string, assessmentId: string, answers: Array<{ questionId: string; text: string }>, writing: string, now: Date) {
  const a = await loadOwned(streamId, assessmentId, "PROMOTION");
  const st = PromotionStateSchema.parse(a.itemsJson);
  const words = st.beginner ? { min: 8, max: 60 } : { min: 60, max: 220 };
  const missing = st.questions.filter((q) => !answers.some((x) => x.questionId === q.id && x.text.trim().length > 0));
  if (missing.length) throw new AppError(422, "INCOMPLETE", `Answer every question (${missing.map((m) => m.id).join(", ")} missing).`);
  const wGuard = guardSubmission(writing, { minWords: words.min, maxWords: words.max });
  if (!wGuard.ok) throw new AppError(422, wGuard.code ?? "REJECTED", `Writing: ${wGuard.message}`);
  const audience = await streamAudience(streamId);

  const items = [];
  const comprehension = [];
  for (const q of st.questions) {
    const text = answers.find((x) => x.questionId === q.id)?.text ?? "";
    const g = guardSubmission(text, { minWords: st.beginner ? 3 : 5, maxWords: 150 });
    if (!g.ok) throw new AppError(422, g.code ?? "REJECTED", `${q.id}: ${g.message}`);
    const copy = detectCopy(text, st.excerpt);
    if (copy.isCopy) {
      items.push({ criteriaMet: 0, criteriaTotal: q.rubric.length, copyRejected: true, criticalLogicError: false, firstAttempt: true });
      comprehension.push({ questionId: q.id, copyRejected: true, similarity: copy.maxJaccard });
      continue;
    }
    const ev = await evaluateComprehension({ question: q.prompt, rubric: q.rubric, answer: text, sourceText: st.excerpt });
    items.push({ criteriaMet: ev.criteriaMet, criteriaTotal: ev.criteriaTotal, copyRejected: false, criticalLogicError: ev.criticalLogicError, firstAttempt: true });
    comprehension.push({ questionId: q.id, copyRejected: false, rubric: ev.rubric, verdictEn: ev.verdictEn, verdictVi: ev.verdictVi });
  }
  const cpr = computeCpr(items) ?? 0;
  const w = await evaluateWriting({ text: writing, prompt: st.writingPrompt, sourceText: st.excerpt, requiredChunks: [], mode: "diagnostic", audience: { ...audience, beginner: !!st.beginner } });
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
  await syncRoadmap(streamId, now);
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

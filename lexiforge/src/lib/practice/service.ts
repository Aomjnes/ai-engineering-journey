/** Practice Studio orchestration. Every query is scoped by streamId. */

import { z } from "zod";
import type { CefrSubBand, PracticeSession, SubmissionKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/http";
import { evaluateWriting } from "@/lib/evaluation/evaluator";
import { guardSubmission } from "@/lib/evaluation/guard";
import { saveSubmission } from "@/lib/evaluation/persist";
import type { EvidenceError } from "@/lib/evaluation/schemas";
import { buildInlineDiff } from "@/lib/evaluation/spans";
import { streamAudience } from "@/lib/i18n/server";
import { bandLabel, computeGai, computeLri, isBeginnerBand, type SubBand } from "@/lib/metrics/scoring";
import { wordDiff } from "@/lib/metrics/similarity";
import { newCard, ratingFromRecall } from "@/lib/metrics/srs";
import { countWords, round } from "@/lib/metrics/text";
import { recordPracticeEvidence, requireProfile } from "@/lib/profile/service";
import { toScored } from "@/lib/evaluation/evaluator";
import { chipsFor, DictationSetSchema, generateDictation, generateSentences, generateSpeaking, levelGroup, normSentence, SentenceSetSchema, SpeakingSetSchema, type DictationSet, type SentenceSet, type SpeakingSet, type Topic } from "./content";
import { cachedPracticeSet } from "./cache";
import { BEGINNER_DICTATION, BEGINNER_SPEAKING, rotatingSet } from "./static-bank";
import { FOUNDATION_DECKS, findDeck, MASTERY_STREAK } from "./foundation-decks";
import { coachTurn, MAX_USER_TURNS, SCENARIOS, scenariosFor, type TranscriptLine } from "./roleplay";

export type PracticeMode = "DICTATION" | "SPEAKING" | "SENTENCE" | "ROLEPLAY";
export const SPEAKING_PASS = 0.85;
export const CHIP_REVEAL_AFTER = 3;

const KIND: Record<PracticeMode, SubmissionKind> = { DICTATION: "PRACTICE_DICTATION", SPEAKING: "PRACTICE_SPEAKING", SENTENCE: "PRACTICE_SENTENCE", ROLEPLAY: "PRACTICE_ROLEPLAY" };

async function learner(streamId: string) {
  const profile = await requireProfile(streamId);
  const band = profile.subBand as SubBand;
  return { profile, band, level: profile.abilityLevel, group: levelGroup(band), beginner: isBeginnerBand(band) };
}

/** Topic = today's real news headline (easiest recent article) + the active roadmap milestone. */
async function currentTopic(streamId: string, now: Date): Promise<Topic> {
  const [article, milestone] = await Promise.all([
    prisma.dailyArticle.findFirst({ where: { ingestedAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } }, orderBy: { difficultyScore: "asc" }, select: { title: true } }),
    prisma.roadmapMilestone.findFirst({ where: { streamId, status: "ACTIVE" }, select: { titleEn: true } }),
  ]);
  return { headline: article?.title ?? null, milestone: milestone?.titleEn ?? null };
}

// ───────────────────────────── State shapes ─────────────────────────────

const DictationStateSchema = z.object({ items: z.array(z.object({ attempts: z.number(), firstAccuracy: z.number().nullable(), checked: z.boolean(), locked: z.boolean() })) });
const SpeakingStateSchema = z.object({ items: z.array(z.object({ attempts: z.number(), best: z.number(), passed: z.boolean() })) });
const SentenceStateSchema = z.object({ items: z.array(z.object({ attempts: z.number(), passed: z.boolean(), firstTryPassed: z.boolean().nullable(), chipFailures: z.number(), gai: z.number().nullable(), lri: z.number().nullable() })) });
const RoleplayStateSchema = z.object({ scenarioId: z.string(), transcript: z.array(z.object({ role: z.enum(["partner", "learner"]), text: z.string() })), turns: z.array(z.object({ gai: z.number(), lri: z.number(), words: z.number() })), finished: z.boolean() });

async function loadSession(streamId: string, id: string, mode?: PracticeMode) {
  const s = await prisma.practiceSession.findFirst({ where: { id, streamId } });
  if (!s || (mode && s.mode !== mode)) throw new AppError(404, "PRACTICE_NOT_FOUND", "Practice session not found.");
  return s;
}

async function saveState(streamId: string, s: PracticeSession, state: object, extra: { status?: string; score?: number | null; completedAt?: Date } = {}) {
  return prisma.practiceSession.update({ where: { id: s.id, streamId }, data: { stateJson: state, ...extra } });
}

/** Public, answer-free view of a session for the client. */
export function sessionView(s: PracticeSession) {
  const base = { id: s.id, mode: s.mode as PracticeMode, level: bandLabel(s.level as SubBand), topic: s.topic, status: s.status, score: s.score };
  if (s.mode === "DICTATION") {
    const items = (s.itemsJson as DictationSet).items;
    const st = DictationStateSchema.parse(s.stateJson);
    // The sentence text is needed for browser TTS; the UI never renders it before the learner answers.
    return { ...base, items: items.map((it, i) => ({ index: i, audio: it.text, vi: it.vi, ...st.items[i], reveal: st.items[i]?.checked ? it.text : null })) };
  }
  if (s.mode === "SPEAKING") {
    const items = (s.itemsJson as SpeakingSet).items;
    const st = SpeakingStateSchema.parse(s.stateJson);
    return { ...base, items: items.map((it, i) => ({ index: i, ...it, ...st.items[i] })) };
  }
  if (s.mode === "SENTENCE") {
    const items = (s.itemsJson as SentenceSet).items;
    const st = SentenceStateSchema.parse(s.stateJson);
    return {
      ...base,
      chipMode: isBeginnerBand(s.level as SubBand),
      items: items.map((it, i) => {
        const state = st.items[i];
        const showAnswer = !!state && (state.passed || state.chipFailures >= CHIP_REVEAL_AFTER);
        return { index: i, vi: it.vi, trapVi: state?.passed ? it.trapVi : null, chips: chipsFor(it.en, it.distractors, `${s.id}:${i}`), answer: showAnswer ? it.en : null, ...state };
      }),
    };
  }
  const st = RoleplayStateSchema.parse(s.stateJson);
  const sc = SCENARIOS.find((x) => x.id === st.scenarioId);
  return { ...base, scenario: sc ? { id: sc.id, titleVi: sc.titleVi, titleEn: sc.titleEn, setupVi: sc.setupVi, setupEn: sc.setupEn } : null, transcript: st.transcript, finished: st.finished, userTurns: st.turns.length, maxTurns: MAX_USER_TURNS };
}

// ───────────────────────────── Start ─────────────────────────────

export async function startSession(streamId: string, mode: PracticeMode, scenarioId: string | undefined, now: Date) {
  const { band, level, group } = await learner(streamId);
  const topic = await currentTopic(streamId, now);
  const topicLabel = topic.headline ?? topic.milestone ?? "Everyday life";
  let itemsJson: object;
  let stateJson: object;
  // Variant = how many sessions of this mode the learner already did at this level and topic: a new start gets
  // a fresh set, while other streams at the same level reuse the same cached sets (no extra LLM calls).
  const variant = await prisma.practiceSession.count({ where: { streamId, mode, level: band as CefrSubBand, topic: topicLabel.slice(0, 300) } });
  const beginner = isBeginnerBand(band);
  const cacheOpts = { level: band, topic: topicLabel, variant };
  if (mode === "DICTATION") {
    const set: DictationSet = beginner
      ? { items: rotatingSet(BEGINNER_DICTATION, variant) }
      : (await cachedPracticeSet({ ...cacheOpts, mode, schema: DictationSetSchema, generate: () => generateDictation(band, level, topic) })).set;
    itemsJson = set;
    stateJson = { items: set.items.map(() => ({ attempts: 0, firstAccuracy: null, checked: false, locked: false })) };
  } else if (mode === "SPEAKING") {
    const set: SpeakingSet = beginner
      ? { items: rotatingSet(BEGINNER_SPEAKING, variant) }
      : (await cachedPracticeSet({ ...cacheOpts, mode, schema: SpeakingSetSchema, generate: () => generateSpeaking(band, topic) })).set;
    itemsJson = set;
    stateJson = { items: set.items.map(() => ({ attempts: 0, best: 0, passed: false })) };
  } else if (mode === "SENTENCE") {
    const set: SentenceSet = (await cachedPracticeSet({ ...cacheOpts, mode, schema: SentenceSetSchema, generate: () => generateSentences(band, topic) })).set;
    itemsJson = set;
    stateJson = { items: set.items.map(() => ({ attempts: 0, passed: false, firstTryPassed: null, chipFailures: 0, gai: null, lri: null })) };
  } else {
    const sc = SCENARIOS.find((s) => s.id === scenarioId && s.groups.includes(group));
    if (!sc) throw new AppError(422, "INVALID_SCENARIO", "Choose a scenario for your level.");
    const opener = sc.opener.replace("{headline}", topic.headline ?? "the latest headline");
    itemsJson = { scenarioId: sc.id };
    stateJson = { scenarioId: sc.id, transcript: [{ role: "partner", text: opener }], turns: [], finished: false };
  }
  const s = await prisma.practiceSession.create({ data: { streamId, mode, level: band as CefrSubBand, topic: topicLabel.slice(0, 300), itemsJson, stateJson, createdAt: now } });
  return sessionView(s);
}

// ───────────────────────────── Dictation ─────────────────────────────

export async function checkDictation(streamId: string, sessionId: string, index: number, typed: string, now: Date) {
  const s = await loadSession(streamId, sessionId, "DICTATION");
  const item = (s.itemsJson as DictationSet).items[index];
  const st = DictationStateSchema.parse(s.stateJson);
  const state = st.items[index];
  if (!item || !state) throw new AppError(404, "ITEM_NOT_FOUND", "Item not found.");
  if (state.locked) throw new AppError(409, "ALREADY_DONE", "This sentence is already locked in.");
  if (!typed.trim()) throw new AppError(422, "EMPTY", "Type what you heard.");
  const diff = wordDiff(item.text, typed);
  state.attempts++;
  if (state.firstAccuracy === null) state.firstAccuracy = round(diff.accuracy, 4);
  state.checked = true;
  if (diff.perfect) state.locked = true;
  await saveSubmission({ streamId, kind: KIND.DICTATION, text: typed, wordCount: countWords(typed), taskDifficulty: 0, attemptNumber: state.attempts, cpr: round(diff.accuracy * 100), passedGate: diff.perfect, evidence: { sessionId, index, ops: diff.ops } });
  const updated = await saveState(streamId, s, st);
  const done = await maybeCompleteDictation(streamId, updated, now);
  return { diff, expected: item.text, vi: item.vi, locked: state.locked, mustLockIn: !diff.perfect, session: sessionView(done) };
}

/** After a mistake the learner must type the corrected sentence exactly once to lock it in. */
export async function lockInDictation(streamId: string, sessionId: string, index: number, typed: string, now: Date) {
  const s = await loadSession(streamId, sessionId, "DICTATION");
  const item = (s.itemsJson as DictationSet).items[index];
  const st = DictationStateSchema.parse(s.stateJson);
  const state = st.items[index];
  if (!item || !state) throw new AppError(404, "ITEM_NOT_FOUND", "Item not found.");
  if (!state.checked) throw new AppError(409, "CHECK_FIRST", "Check your first attempt before locking in.");
  const diff = wordDiff(item.text, typed);
  if (!diff.perfect) return { locked: false, diff, session: sessionView(s) };
  state.locked = true;
  const updated = await saveState(streamId, s, st);
  const done = await maybeCompleteDictation(streamId, updated, now);
  return { locked: true, diff, session: sessionView(done) };
}

async function maybeCompleteDictation(streamId: string, s: PracticeSession, now: Date) {
  const st = DictationStateSchema.parse(s.stateJson);
  if (s.status === "COMPLETED" || !st.items.every((i) => i.locked)) return s;
  const firsts = st.items.map((i) => i.firstAccuracy ?? 0);
  const score = round((100 * firsts.reduce((a, b) => a + b, 0)) / firsts.length);
  await recordPracticeEvidence(streamId, { cpr: score, words: 0, items: firsts.length }, now);
  return prisma.practiceSession.update({ where: { id: s.id, streamId }, data: { status: "COMPLETED", score, completedAt: now } });
}

// ───────────────────────────── Speaking ─────────────────────────────

export async function checkSpeaking(streamId: string, sessionId: string, index: number, transcript: string, now: Date) {
  const s = await loadSession(streamId, sessionId, "SPEAKING");
  const item = (s.itemsJson as SpeakingSet).items[index];
  const st = SpeakingStateSchema.parse(s.stateJson);
  const state = st.items[index];
  if (!item || !state) throw new AppError(404, "ITEM_NOT_FOUND", "Item not found.");
  if (!transcript.trim()) throw new AppError(422, "EMPTY", "No speech was recognized. Try again closer to the microphone.");
  const diff = wordDiff(item.text, transcript);
  state.attempts++;
  state.best = Math.max(state.best, round(diff.accuracy, 4));
  const passed = diff.accuracy >= SPEAKING_PASS;
  if (passed) state.passed = true;
  await saveSubmission({ streamId, kind: KIND.SPEAKING, text: transcript, wordCount: countWords(transcript), taskDifficulty: 0, attemptNumber: state.attempts, passedGate: passed, evidence: { sessionId, index, accuracy: diff.accuracy, ops: diff.ops } });
  let updated = await saveState(streamId, s, st);
  if (updated.status !== "COMPLETED" && st.items.every((i) => i.passed)) {
    const score = round((100 * st.items.reduce((a, b) => a + b.best, 0)) / st.items.length);
    await recordPracticeEvidence(streamId, { words: 0, items: st.items.length }, now);
    updated = await prisma.practiceSession.update({ where: { id: s.id, streamId }, data: { status: "COMPLETED", score, completedAt: now } });
  }
  return { diff, accuracy: diff.accuracy, passed, required: SPEAKING_PASS, session: sessionView(updated) };
}

// ───────────────────────────── Sentence builder ─────────────────────────────

const accepts = (item: SentenceSet["items"][number], text: string) => [item.en, ...item.accepted].some((a) => normSentence(a) === normSentence(text));

export async function checkSentence(streamId: string, sessionId: string, index: number, input: { chips?: string[]; text?: string }, now: Date) {
  const s = await loadSession(streamId, sessionId, "SENTENCE");
  const item = (s.itemsJson as SentenceSet).items[index];
  const st = SentenceStateSchema.parse(s.stateJson);
  const state = st.items[index];
  if (!item || !state) throw new AppError(404, "ITEM_NOT_FOUND", "Item not found.");
  if (state.passed) throw new AppError(409, "ALREADY_DONE", "This sentence is already done.");
  state.attempts++;
  let passed = false;
  let errors: EvidenceError[] = [];
  let verdict: { en: string; vi: string } | null = null;
  let diffSegments = null;
  if (input.chips) {
    passed = accepts(item, input.chips.join(" "));
    if (!passed) state.chipFailures++;
    await saveSubmission({ streamId, kind: KIND.SENTENCE, text: input.chips.join(" "), wordCount: input.chips.length, taskDifficulty: 0, attemptNumber: state.attempts, passedGate: passed, evidence: { sessionId, index, mode: "chips" } });
  } else {
    const text = (input.text ?? "").trim();
    const guard = guardSubmission(text, { minWords: 2, maxWords: 40 });
    if (!guard.ok) throw new AppError(422, guard.code ?? "REJECTED", guard.message ?? "Rejected.");
    if (accepts(item, text)) {
      passed = true;
    } else {
      const ev = await evaluateWriting({
        text,
        prompt: `Translate into natural English: "${item.vi}". Reference meaning: "${item.en}". A different but natural, correct translation is acceptable; a different meaning is off-prompt (LOGIC_COMPREHENSION).`,
        requiredChunks: [],
        mode: "practice",
        audience: await streamAudience(streamId),
      });
      errors = ev.errors;
      passed = !ev.offPrompt && !ev.errors.some((e) => e.severity !== "MINOR");
      verdict = { en: ev.verdictEn, vi: ev.verdictVi };
      diffSegments = buildInlineDiff(text, ev.errors);
      if (state.gai === null) {
        state.gai = ev.gai.gai;
        state.lri = ev.lri.lri;
      }
    }
    await saveSubmission({ streamId, kind: KIND.SENTENCE, text, wordCount: countWords(text), taskDifficulty: 0, attemptNumber: state.attempts, passedGate: passed, gai: state.gai ?? undefined, lri: state.lri ?? undefined, evidence: { sessionId, index, mode: "typed" }, errors });
  }
  if (state.firstTryPassed === null) state.firstTryPassed = passed;
  if (passed) {
    state.passed = true;
    await addSrsCard(streamId, item.en, { meaningVi: item.vi, meaningEn: item.en, sentence: item.en }, now);
  }
  let updated = await saveState(streamId, s, st);
  if (updated.status !== "COMPLETED" && st.items.every((i) => i.passed)) {
    const score = round((100 * st.items.filter((i) => i.firstTryPassed).length) / st.items.length);
    const typed = st.items.filter((i) => i.gai !== null);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    await recordPracticeEvidence(streamId, { gai: avg(typed.map((i) => i.gai as number)), lri: avg(typed.map((i) => i.lri as number)), words: 0, items: st.items.length }, now);
    updated = await prisma.practiceSession.update({ where: { id: s.id, streamId }, data: { status: "COMPLETED", score, completedAt: now } });
  }
  return { passed, errors, verdict, diff: diffSegments, reveal: !passed && state.chipFailures >= CHIP_REVEAL_AFTER ? item.en : null, trapVi: passed ? item.trapVi : null, session: sessionView(updated) };
}

// ───────────────────────────── Roleplay ─────────────────────────────

export async function roleplayTurn(streamId: string, sessionId: string, text: string, now: Date) {
  const s = await loadSession(streamId, sessionId, "ROLEPLAY");
  if (s.status === "COMPLETED") throw new AppError(409, "ALREADY_DONE", "This conversation is finished.");
  const st = RoleplayStateSchema.parse(s.stateJson);
  const sc = SCENARIOS.find((x) => x.id === st.scenarioId);
  if (!sc) throw new AppError(404, "INVALID_SCENARIO", "Scenario not found.");
  const guard = guardSubmission(text, { minWords: 1, maxWords: 120 });
  if (!guard.ok) throw new AppError(422, guard.code ?? "REJECTED", guard.message ?? "Rejected.");
  const { band } = await learner(streamId);
  const audience = await streamAudience(streamId);
  const userTurn = st.turns.length + 1;
  const coached = await coachTurn({ scenario: sc, levelLabel: bandLabel(band), beginner: isBeginnerBand(band), transcript: st.transcript as TranscriptLine[], learnerText: text, userTurn, audience });
  const scored = toScored(coached.errors);
  const gai = computeGai(text, scored).gai;
  const lri = computeLri({ text, errors: scored, chunksRequired: 0, chunksUsedCorrectly: 0 }).lri;
  await saveSubmission({ streamId, kind: KIND.ROLEPLAY, text, wordCount: countWords(text), taskDifficulty: 0, attemptNumber: userTurn, gai, lri, passedGate: !coached.errors.some((e) => e.severity !== "MINOR"), evidence: { sessionId, scenarioId: sc.id, nativeVersion: coached.nativeVersion }, errors: coached.errors });
  st.transcript.push({ role: "learner", text }, { role: "partner", text: coached.partnerReply });
  st.turns.push({ gai, lri, words: countWords(text) });
  st.finished = coached.finished || userTurn >= MAX_USER_TURNS;
  let updated = await saveState(streamId, s, st);
  if (st.finished) {
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const score = round(avg(st.turns.map((t) => t.gai)));
    await recordPracticeEvidence(streamId, { gai: score, lri: avg(st.turns.map((t) => t.lri)), words: st.turns.reduce((a, t) => a + t.words, 0), items: 0 }, now);
    updated = await prisma.practiceSession.update({ where: { id: s.id, streamId }, data: { status: "COMPLETED", score, completedAt: now } });
  }
  return {
    coach: { errors: coached.errors, diff: buildInlineDiff(text, coached.errors), nativeVersion: coached.nativeVersion, coachEn: coached.coachEn, coachVi: coached.coachVi, gai, lri },
    partnerReply: coached.partnerReply,
    session: sessionView(updated),
  };
}

// ───────────────────────────── SRS & foundation decks ─────────────────────────────

async function addSrsCard(streamId: string, front: string, back: { meaningVi: string; meaningEn: string; sentence: string }, now: Date) {
  const exists = await prisma.srsCard.findFirst({ where: { streamId, front }, select: { id: true } });
  if (exists) return exists.id;
  const c = newCard(now);
  const card = await prisma.srsCard.create({ data: { streamId, front, back: JSON.stringify(back), stability: c.stability, difficulty: c.difficulty, state: c.state, dueAt: c.dueAt, createdAt: now } });
  return card.id;
}

export async function foundationOverview(streamId: string) {
  const rows = await prisma.foundationProgress.findMany({ where: { streamId }, select: { deckId: true, mastered: true } });
  return FOUNDATION_DECKS.map((d) => ({ id: d.id, titleVi: d.titleVi, titleEn: d.titleEn, descVi: d.descVi, descEn: d.descEn, total: d.items.length, mastered: rows.filter((r) => r.deckId === d.id && r.mastered).length }));
}

/** Next unmastered item: fewest attempts first, then deck order. */
export async function nextFoundationItem(streamId: string, deckId: string) {
  const deck = findDeck(deckId);
  if (!deck) throw new AppError(404, "DECK_NOT_FOUND", "Deck not found.");
  const rows = await prisma.foundationProgress.findMany({ where: { streamId, deckId } });
  const byKey = new Map(rows.map((r) => [r.itemKey, r]));
  const candidates = deck.items.filter((i) => !byKey.get(i.key)?.mastered).sort((a, b) => (byKey.get(a.key)?.attempts ?? 0) - (byKey.get(b.key)?.attempts ?? 0));
  const item = candidates[0];
  const mastered = deck.items.length - candidates.length;
  if (!item) return { deckId, done: true as const, mastered, total: deck.items.length };
  // Listen-mode answers are needed for browser TTS; the UI never renders them before the answer.
  return { deckId, done: false as const, mastered, total: deck.items.length, item: { key: item.key, mode: item.mode, cueVi: item.cueVi, cueEn: item.cueEn, ipa: item.ipa ?? null, audio: item.mode === "listen" ? item.answer : null, progress: byKey.get(item.key)?.correct ?? 0 } };
}

export async function answerFoundation(streamId: string, deckId: string, key: string, typed: string, responseMs: number, now: Date) {
  const deck = findDeck(deckId);
  const item = deck?.items.find((i) => i.key === key);
  if (!deck || !item) throw new AppError(404, "ITEM_NOT_FOUND", "Item not found.");
  const rating = ratingFromRecall(item.answer, typed, responseMs);
  const correct = rating >= 3;
  const row = await prisma.foundationProgress.upsert({
    where: { streamId_deckId_itemKey: { streamId, deckId, itemKey: key } },
    update: { attempts: { increment: 1 }, correct: correct ? { increment: 1 } : undefined },
    create: { streamId, deckId, itemKey: key, attempts: 1, correct: correct ? 1 : 0 },
  });
  let masteredNow = false;
  if (!row.mastered && row.correct >= MASTERY_STREAK) {
    const cardId = await addSrsCard(streamId, item.answer, { meaningVi: item.cueVi, meaningEn: item.cueEn, sentence: item.answer }, now);
    await prisma.foundationProgress.update({ where: { id: row.id, streamId }, data: { mastered: true, srsCardId: cardId } });
    masteredNow = true;
  }
  await saveSubmission({ streamId, kind: "PRACTICE_FOUNDATION", text: typed || "(empty)", wordCount: countWords(typed), taskDifficulty: 0, passedGate: correct, evidence: { deckId, key, rating } });
  return { rating, correct, answer: item.answer, ipa: item.ipa ?? null, noteVi: item.noteVi ?? null, progress: row.correct, required: MASTERY_STREAK, masteredNow };
}

// ───────────────────────────── Overview ─────────────────────────────

export async function practiceOverview(streamId: string) {
  const { band, group, beginner } = await learner(streamId);
  const [recent, milestone, decks] = await Promise.all([
    prisma.practiceSession.findMany({ where: { streamId }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, mode: true, status: true, score: true, topic: true, createdAt: true } }),
    prisma.roadmapMilestone.findFirst({ where: { streamId, status: "ACTIVE" }, select: { coreTopicsJson: true, titleVi: true, titleEn: true } }),
    foundationOverview(streamId),
  ]);
  const topics = milestone?.coreTopicsJson as { vi?: { practice?: string[] } } | undefined;
  return {
    level: bandLabel(band),
    group,
    beginner,
    recommended: topics?.vi?.practice ?? (beginner ? ["FOUNDATION", "SPEAKING", "DICTATION"] : ["DICTATION", "SENTENCE", "ROLEPLAY"]),
    milestone: milestone ? { titleVi: milestone.titleVi, titleEn: milestone.titleEn } : null,
    scenarios: scenariosFor(group).map((s) => ({ id: s.id, titleVi: s.titleVi, titleEn: s.titleEn, setupVi: s.setupVi, setupEn: s.setupEn })),
    decks,
    recent,
  };
}

export async function getSession(streamId: string, id: string) {
  return sessionView(await loadSession(streamId, id));
}

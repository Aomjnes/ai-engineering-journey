/**
 * Adaptive staircase placement (pure state machine; the API layer persists PlacementState).
 *
 * Tiers: 0 Pre-A1 (audio → meaning, survival phrases, word order) · 1 A1–A2 (3-sentence passages, basic
 * mistakes, 2–3 sentence writing) · 2 B1–B2 (authentic passages, Vietlish traps, 60–90 words) · 3 C1
 * (nuance, register, 90–120 words).
 *
 * Start tier = the learner's chosen comfort. After each tier's objective block:
 *   accuracy ≥ 0.7 → climb (if the next tier is unvisited) · accuracy < 0.5 → descend (if unvisited) · else stop.
 * Tier 0 ends early after 4 misses/skips in its first 5 items. If no tier reaches 0.5 and Tier 0 was visited,
 * the audit stops without any writing and places the learner at Pre-A1/A1.1. Otherwise one writing task at
 * max(1, highest passed tier). "I don't know / skip" is always allowed and scores 0.
 */

import { z } from "zod";
import { estimateAbility, pickNextItem, type ItemResponse } from "@/lib/metrics/irt";
import { bandFromLevel, compositeScore, ieltsEstimate, type SubBand } from "@/lib/metrics/scoring";
import { clamp, round } from "@/lib/metrics/text";
import { TIER0_EARLY_STOP_MISSES, TIER0_ITEMS, TIER_BLOCKS, WRITING_TASKS, type ErrorDetectionItem, type ReadingPassage, type Tier0Item } from "./item-bank";

export type Tier = 0 | 1 | 2 | 3;
export const PLACEMENT_PRIOR = { mean: 35, sd: 30 } as const;
const CLIMB = 0.7;
const PASS = 0.5;

const ResponseSchema = z.object({
  itemId: z.string(),
  tier: z.number().int().min(0).max(3),
  difficulty: z.number(),
  correct: z.boolean(),
  skipped: z.boolean(),
  section: z.enum(["T0", "READING", "ERRORS"]),
});
export type PlacementResponse = z.infer<typeof ResponseSchema>;

export const PlacementStateSchema = z.object({
  version: z.literal(2),
  comfortTier: z.number().int().min(0).max(3),
  phase: z.enum(["OBJECTIVE", "WRITING", "DONE"]),
  tier: z.number().int().min(0).max(3),
  /** Queue of unit ids for the current tier (passages, error items or tier-0 items). */
  queue: z.array(z.string()),
  /** Units of the current tier already answered. */
  served: z.array(z.string()),
  visited: z.array(z.number().int()),
  tierAccuracy: z.record(z.string(), z.number()),
  responses: z.array(ResponseSchema),
  writingTier: z.number().int().min(1).max(3).nullable(),
  stoppedEarly: z.boolean(),
  writingSkipped: z.boolean(),
});
export type PlacementState = z.infer<typeof PlacementStateSchema>;

export class PlacementFlowError extends Error {
  readonly code = "DIAGNOSTIC_FLOW";
}

const toIrt = (r: readonly PlacementResponse[]): ItemResponse[] => r.map((x) => ({ difficulty: x.difficulty, correct: x.correct }));
const theta = (r: readonly PlacementResponse[]) => (r.length ? estimateAbility(toIrt(r), PLACEMENT_PRIOR) : PLACEMENT_PRIOR.mean);

function passageById(id: string): ReadingPassage | undefined {
  for (const t of [1, 2, 3] as const) {
    const p = TIER_BLOCKS[t].passages.find((x) => x.id === id);
    if (p) return p;
  }
  return undefined;
}
function errorById(id: string): ErrorDetectionItem | undefined {
  for (const t of [1, 2, 3] as const) {
    const e = TIER_BLOCKS[t].errors.find((x) => x.id === id);
    if (e) return e;
  }
  return undefined;
}

/** Builds a tier's unit queue: tier 0 = all items easy→hard; tiers 1–3 = adaptively chosen passages + error items. */
function tierQueue(tier: Tier, responses: readonly PlacementResponse[]): string[] {
  if (tier === 0) return [...TIER0_ITEMS].sort((a, b) => a.difficulty - b.difficulty).map((i) => i.id);
  const block = TIER_BLOCKS[tier];
  const th = clamp(theta(responses), 0, 100);
  const pick = <T extends { id: string; difficulty: number }>(items: readonly T[], n: number) => {
    const used = new Set<number>();
    const out: string[] = [];
    for (let k = 0; k < Math.min(n, items.length); k++) {
      const idx = pickNextItem(items, used, th);
      if (idx === null) break;
      used.add(idx);
      out.push((items[idx] as T).id);
    }
    return out;
  };
  return [...pick(block.passages, block.passagesServed), ...pick(block.errors, block.errorsServed)];
}

export function initPlacement(comfortTier: Tier): PlacementState {
  return {
    version: 2,
    comfortTier,
    phase: "OBJECTIVE",
    tier: comfortTier,
    queue: tierQueue(comfortTier, []),
    served: [],
    visited: [comfortTier],
    tierAccuracy: {},
    responses: [],
    writingTier: null,
    stoppedEarly: false,
    writingSkipped: false,
  };
}

export function currentUnitId(state: PlacementState): string | null {
  if (state.phase !== "OBJECTIVE") return null;
  return state.queue[state.served.length] ?? null;
}

export type Answer =
  | { kind: "skip" }
  | { kind: "choice"; choice: number }
  | { kind: "choices"; choices: number[] }
  | { kind: "order"; words: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();

function gradeTier0(item: Tier0Item, a: Answer): boolean {
  if (a.kind === "skip") return false;
  if (item.kind === "WORD_ORDER") return a.kind === "order" && norm(a.words.join(" ")) === norm(item.sentence);
  return a.kind === "choice" && a.choice === item.answer;
}

/** Records one answer for the current unit and advances the staircase. */
export function answerUnit(state: PlacementState, unitId: string, answer: Answer): PlacementState {
  if (state.phase !== "OBJECTIVE" || currentUnitId(state) !== unitId) throw new PlacementFlowError("This item is not the current item.");
  const tier = state.tier as Tier;
  const added: PlacementResponse[] = [];
  if (tier === 0) {
    const item = TIER0_ITEMS.find((i) => i.id === unitId);
    if (!item) throw new PlacementFlowError("Unknown item.");
    added.push({ itemId: item.id, tier, difficulty: item.difficulty, correct: gradeTier0(item, answer), skipped: answer.kind === "skip", section: "T0" });
  } else if (passageById(unitId)) {
    const p = passageById(unitId) as ReadingPassage;
    const choices = answer.kind === "choices" ? answer.choices : null;
    if (answer.kind !== "skip" && (!choices || choices.length !== p.questions.length)) throw new PlacementFlowError(`Answer all ${p.questions.length} questions or skip.`);
    p.questions.forEach((q, i) => added.push({ itemId: q.id, tier, difficulty: q.difficulty, correct: !!choices && choices[i] === q.answer, skipped: answer.kind === "skip", section: "READING" }));
  } else {
    const e = errorById(unitId);
    if (!e) throw new PlacementFlowError("Unknown item.");
    const ok = answer.kind === "choice" && answer.choice === e.answer;
    if (answer.kind !== "skip" && answer.kind !== "choice") throw new PlacementFlowError("Choose a segment or skip.");
    added.push({ itemId: e.id, tier, difficulty: e.difficulty, correct: ok, skipped: answer.kind === "skip", section: "ERRORS" });
  }
  const next: PlacementState = { ...state, responses: [...state.responses, ...added], served: [...state.served, unitId] };
  const tierResponses = next.responses.filter((r) => r.tier === tier);
  const misses = tierResponses.filter((r) => !r.correct).length;
  const earlyStop = tier === 0 && next.served.length <= 5 && misses >= TIER0_EARLY_STOP_MISSES;
  if (!earlyStop && next.served.length < next.queue.length) return next;
  return closeTier(next, earlyStop);
}

function closeTier(state: PlacementState, earlyStop: boolean): PlacementState {
  const tier = state.tier as Tier;
  const rs = state.responses.filter((r) => r.tier === tier);
  const acc = rs.length ? rs.filter((r) => r.correct).length / rs.length : 0;
  const tierAccuracy = { ...state.tierAccuracy, [String(tier)]: round(acc, 4) };
  const s: PlacementState = { ...state, tierAccuracy, stoppedEarly: state.stoppedEarly || earlyStop };
  const go = (t: Tier): PlacementState => ({ ...s, tier: t, queue: tierQueue(t, s.responses), served: [], visited: [...s.visited, t] });
  if (!earlyStop && acc >= CLIMB && tier < 3 && !s.visited.includes(tier + 1)) return go((tier + 1) as Tier);
  if (acc < PASS && tier > 0 && !s.visited.includes(tier - 1)) return go((tier - 1) as Tier);
  const passed = Object.entries(tierAccuracy).filter(([, a]) => a >= PASS).map(([t]) => Number(t));
  if (passed.length === 0 && s.visited.includes(0)) return { ...s, phase: "DONE", writingTier: null };
  const writingTier = Math.max(1, ...passed) as 1 | 2 | 3;
  return { ...s, phase: "WRITING", writingTier };
}

export function skipWriting(state: PlacementState): PlacementState {
  if (state.phase !== "WRITING") throw new PlacementFlowError("There is no writing task to skip.");
  return { ...state, phase: "DONE", writingSkipped: true };
}

/** Item as shown to the learner. Answer keys never leave the server. */
export function publicItem(state: PlacementState) {
  const progress = { tier: state.tier, served: state.served.length, total: state.queue.length, visited: state.visited };
  if (state.phase === "WRITING" && state.writingTier) {
    const w = WRITING_TASKS[state.writingTier as 1 | 2 | 3];
    return { part: "WRITING" as const, id: `writing-${w.tier}`, tier: w.tier, promptEn: w.promptEn, promptVi: w.promptVi, hintsVi: w.hintsVi, minWords: w.minWords, maxWords: w.maxWords, progress };
  }
  const id = currentUnitId(state);
  if (!id) return null;
  if (state.tier === 0) {
    const it = TIER0_ITEMS.find((x) => x.id === id) as Tier0Item;
    if (it.kind === "AUDIO_MEANING") return { part: "AUDIO_MEANING" as const, id, say: it.say, options: it.options, progress };
    if (it.kind === "PHRASE_MATCH") return { part: "PHRASE_MATCH" as const, id, situationVi: it.situationVi, situationEn: it.situationEn, options: it.options, progress };
    return { part: "WORD_ORDER" as const, id, hintVi: it.hintVi, hintEn: it.hintEn, chips: it.scrambled, progress };
  }
  const p = passageById(id);
  if (p) return { part: "READING" as const, id, title: p.title, text: p.text, questions: p.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options })), progress };
  const e = errorById(id) as ErrorDetectionItem;
  return { part: "ERRORS" as const, id, segments: e.segments, progress };
}

/** Writing-implied level: ws = 0.55·GAI + 0.45·LRI mapped linearly from ws ∈ [30, 95] into the task's level range. */
export function writingImpliedLevel(gai: number, lri: number, range: readonly [number, number] = [0, 100]): number {
  const ws = 0.55 * gai + 0.45 * lri;
  const t = clamp((ws - 30) / 65, 0, 1);
  return range[0] + t * (range[1] - range[0]);
}

export const PRE_A1_CEILING = 24.9; // stopped in Tier 0 → Pre-A1 or A1.1 only

export interface PlacementResult {
  theta: number;
  writingLevel: number | null;
  level: number;
  subBand: SubBand;
  ielts: ReturnType<typeof ieltsEstimate>;
  objectiveAccuracy: number;
  readingAccuracy: number | null;
  tierAccuracy: Record<string, number>;
  gai: number | null;
  lri: number | null;
  composite: number;
  evidenceItems: number;
  evidenceWords: number;
  skipped: number;
  missedTraps: string[];
  stoppedEarly: boolean;
}

export function computePlacementResult(state: PlacementState, writing: { gai: number; lri: number; words: number } | null, trapOf: (itemId: string) => string | undefined): PlacementResult {
  const th = theta(state.responses);
  let level = th;
  let writingLevel: number | null = null;
  if (writing && state.writingTier) {
    writingLevel = writingImpliedLevel(writing.gai, writing.lri, WRITING_TASKS[state.writingTier as 1 | 2 | 3].levelRange);
    level = 0.65 * th + 0.35 * writingLevel;
  }
  const noTierPassed = Object.values(state.tierAccuracy).every((a) => a < PASS);
  if (noTierPassed && state.visited.includes(0)) level = Math.min(level, PRE_A1_CEILING);
  level = round(clamp(level, 0, 100), 3);
  const pct = (r: PlacementResponse[]) => (r.length ? round((100 * r.filter((x) => x.correct).length) / r.length) : null);
  const reading = state.responses.filter((r) => r.section === "READING");
  const objectiveAccuracy = pct(state.responses) ?? 0;
  const readingAccuracy = pct(reading);
  const cprBaseline = readingAccuracy ?? objectiveAccuracy;
  return {
    theta: th,
    writingLevel: writingLevel === null ? null : round(writingLevel, 3),
    level,
    subBand: bandFromLevel(level),
    ielts: ieltsEstimate(level, writing?.words ?? 0, state.responses.length),
    objectiveAccuracy,
    readingAccuracy,
    tierAccuracy: state.tierAccuracy,
    gai: writing?.gai ?? null,
    lri: writing?.lri ?? null,
    composite: compositeScore({ gai: writing?.gai ?? null, lri: writing?.lri ?? null, cpr: cprBaseline, rss: null, eri: null }) ?? 0,
    evidenceItems: state.responses.length,
    evidenceWords: writing?.words ?? 0,
    skipped: state.responses.filter((r) => r.skipped).length,
    missedTraps: [...new Set(state.responses.filter((r) => r.section === "ERRORS" && !r.correct).map((r) => trapOf(r.itemId)).filter((t): t is string => !!t && t !== "NO_ERROR"))],
    stoppedEarly: state.stoppedEarly || (noTierPassed && state.visited.includes(0)),
  };
}

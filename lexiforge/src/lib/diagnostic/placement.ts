/**
 * Pure state machine for the 3-part adaptive placement audit. No I/O: the API layer persists `PlacementState`
 * in DiagnosticAssessment.itemsJson and calls these transitions.
 */

import { z } from "zod";
import { estimateAbility, pickNextItem, type ItemResponse } from "@/lib/metrics/irt";
import { bandFromLevel, compositeScore, ieltsEstimate, type SubBand } from "@/lib/metrics/scoring";
import { clamp, round } from "@/lib/metrics/text";
import { ERROR_ITEMS, ERROR_ITEMS_SERVED, READING_PASSAGES, READING_PASSAGES_SERVED, WRITING_PROMPTS } from "./item-bank";

const ResponseSchema = z.object({ itemId: z.string(), difficulty: z.number(), correct: z.boolean() });

export const PlacementStateSchema = z.object({
  version: z.literal(1),
  part: z.enum(["READING", "ERRORS", "WRITING", "DONE"]),
  readingServed: z.array(z.string()),
  readingResponses: z.array(ResponseSchema),
  errorServed: z.array(z.string()),
  errorResponses: z.array(ResponseSchema),
  currentId: z.string().nullable(),
  writingPrompt: z.string(),
});
export type PlacementState = z.infer<typeof PlacementStateSchema>;

const START_THETA = 40;

const toIrt = (r: ReadonlyArray<{ difficulty: number; correct: boolean }>): ItemResponse[] => r.map((x) => ({ difficulty: x.difficulty, correct: x.correct }));

function nextPassageId(state: PlacementState): string | null {
  const used = new Set(state.readingServed.map((id) => READING_PASSAGES.findIndex((p) => p.id === id)));
  const theta = state.readingResponses.length ? estimateAbility(toIrt(state.readingResponses)) : START_THETA;
  const idx = pickNextItem(READING_PASSAGES, used, theta);
  return idx === null ? null : (READING_PASSAGES[idx]?.id ?? null);
}

function nextErrorItemId(state: PlacementState): string | null {
  const used = new Set(state.errorServed.map((id) => ERROR_ITEMS.findIndex((p) => p.id === id)));
  // Start the error audit at the reading estimate: the two parts inform each other.
  const all = [...state.readingResponses, ...state.errorResponses];
  const theta = all.length ? estimateAbility(toIrt(all)) : START_THETA;
  const idx = pickNextItem(ERROR_ITEMS, used, theta);
  return idx === null ? null : (ERROR_ITEMS[idx]?.id ?? null);
}

/** `promptSeed` picks the writing prompt deterministically (e.g. day-of-year). */
export function initPlacement(promptSeed: number): PlacementState {
  const base: PlacementState = {
    version: 1,
    part: "READING",
    readingServed: [],
    readingResponses: [],
    errorServed: [],
    errorResponses: [],
    currentId: null,
    writingPrompt: WRITING_PROMPTS[Math.abs(promptSeed) % WRITING_PROMPTS.length] as string,
  };
  const first = nextPassageId(base);
  return { ...base, currentId: first, readingServed: first ? [first] : [] };
}

export class PlacementFlowError extends Error {
  readonly code = "DIAGNOSTIC_FLOW";
}

export function answerReading(state: PlacementState, passageId: string, choices: readonly number[]): PlacementState {
  if (state.part !== "READING" || state.currentId !== passageId) throw new PlacementFlowError("This passage is not the current item.");
  const passage = READING_PASSAGES.find((p) => p.id === passageId);
  if (!passage) throw new PlacementFlowError("Unknown passage.");
  if (choices.length !== passage.questions.length) throw new PlacementFlowError(`Answer all ${passage.questions.length} questions.`);
  const responses = [
    ...state.readingResponses,
    ...passage.questions.map((q, i) => ({ itemId: q.id, difficulty: q.difficulty, correct: choices[i] === q.answer })),
  ];
  const next: PlacementState = { ...state, readingResponses: responses };
  if (next.readingServed.length < READING_PASSAGES_SERVED) {
    const id = nextPassageId(next);
    if (id) return { ...next, currentId: id, readingServed: [...next.readingServed, id] };
  }
  const firstError = nextErrorItemId({ ...next, part: "ERRORS" });
  return { ...next, part: "ERRORS", currentId: firstError, errorServed: firstError ? [firstError] : [] };
}

export function answerErrorItem(state: PlacementState, itemId: string, choice: number): PlacementState {
  if (state.part !== "ERRORS" || state.currentId !== itemId) throw new PlacementFlowError("This item is not the current item.");
  const item = ERROR_ITEMS.find((p) => p.id === itemId);
  if (!item) throw new PlacementFlowError("Unknown item.");
  if (!Number.isInteger(choice) || choice < 0 || choice > 4) throw new PlacementFlowError("Choice must be 0–4.");
  const next: PlacementState = { ...state, errorResponses: [...state.errorResponses, { itemId, difficulty: item.difficulty, correct: choice === item.answer }] };
  if (next.errorServed.length < ERROR_ITEMS_SERVED) {
    const id = nextErrorItemId(next);
    if (id) return { ...next, currentId: id, errorServed: [...next.errorServed, id] };
  }
  return { ...next, part: "WRITING", currentId: "writing" };
}

/** Item as shown to the learner — never includes answers. */
export function publicItem(state: PlacementState) {
  if (state.part === "READING") {
    const p = READING_PASSAGES.find((x) => x.id === state.currentId);
    if (!p) return null;
    return {
      part: "READING" as const,
      id: p.id,
      title: p.title,
      text: p.text,
      questions: p.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options })),
      progress: { served: state.readingServed.length, total: READING_PASSAGES_SERVED },
    };
  }
  if (state.part === "ERRORS") {
    const it = ERROR_ITEMS.find((x) => x.id === state.currentId);
    if (!it) return null;
    return { part: "ERRORS" as const, id: it.id, segments: it.segments, progress: { served: state.errorServed.length, total: ERROR_ITEMS_SERVED } };
  }
  if (state.part === "WRITING") return { part: "WRITING" as const, id: "writing", prompt: state.writingPrompt, minWords: 80, maxWords: 140 };
  return null;
}

/** Writing-implied level: ws = 0.55·GAI + 0.45·LRI; L_w = clamp((ws − 30)·100/65, 0, 100). */
export function writingImpliedLevel(gai: number, lri: number): number {
  const ws = 0.55 * gai + 0.45 * lri;
  return clamp(((ws - 30) * 100) / 65, 0, 100);
}

export interface PlacementResult {
  readingTheta: number;
  errorTheta: number;
  writingLevel: number;
  level: number;
  subBand: SubBand;
  ielts: ReturnType<typeof ieltsEstimate>;
  readingAccuracy: number; // CPR baseline (0–100)
  errorAccuracy: number;
  gai: number;
  lri: number;
  composite: number;
  evidenceItems: number;
  evidenceWords: number;
  missedTraps: string[];
}

export function computePlacementResult(state: PlacementState, writing: { gai: number; lri: number; words: number }): PlacementResult {
  const reading = toIrt(state.readingResponses);
  const errors = toIrt(state.errorResponses);
  const readingTheta = estimateAbility(reading);
  const errorTheta = estimateAbility(errors);
  const writingLevel = writingImpliedLevel(writing.gai, writing.lri);
  const level = round(0.4 * readingTheta + 0.3 * errorTheta + 0.3 * writingLevel, 3);
  const pct = (r: ItemResponse[]) => (r.length ? round((100 * r.filter((x) => x.correct).length) / r.length) : 0);
  const readingAccuracy = pct(reading);
  const items = reading.length + errors.length;
  const missedTraps = state.errorResponses
    .filter((r) => !r.correct)
    .map((r) => ERROR_ITEMS.find((i) => i.id === r.itemId)?.trap)
    .filter((t): t is string => !!t && t !== "NO_ERROR");
  return {
    readingTheta,
    errorTheta,
    writingLevel: round(writingLevel, 3),
    level,
    subBand: bandFromLevel(level),
    ielts: ieltsEstimate(level, writing.words, items),
    readingAccuracy,
    errorAccuracy: pct(errors),
    gai: writing.gai,
    lri: writing.lri,
    composite: compositeScore({ gai: writing.gai, lri: writing.lri, cpr: readingAccuracy, rss: null, eri: null }) ?? 0,
    evidenceItems: items,
    evidenceWords: writing.words,
    missedTraps: [...new Set(missedTraps)],
  };
}

/** FSRS-4.5 scheduler with default weights. See CLAUDE.md § SRS. Pure: time is always a parameter. */

import { clamp, round } from "./text";
import { levenshtein } from "./similarity";

export const FSRS_WEIGHTS = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246,
  1.587, 0.2272, 2.8755,
] as const;
export const DECAY = -0.5;
export const FACTOR = 19 / 81;
export const TARGET_RETENTION = 0.9;
const DAY_MS = 86_400_000;

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export type CardStateName = "NEW" | "LEARNING" | "REVIEW" | "RELEARNING";

export interface CardState {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: CardStateName;
  lastReviewAt: Date | null;
  dueAt: Date;
}

const w = (i: number): number => FSRS_WEIGHTS[i] ?? 0;

export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return (1 + (FACTOR * Math.max(0, elapsedDays)) / stability) ** DECAY;
}

export function intervalDays(stability: number, retention = TARGET_RETENTION): number {
  const raw = (stability / FACTOR) * (retention ** (1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, 36500);
}

function initDifficulty(g: Rating): number {
  return clamp(w(4) - (g - 3) * w(5), 1, 10);
}

function nextDifficulty(d: number, g: Rating): number {
  const updated = d - w(6) * (g - 3);
  return clamp(w(7) * initDifficulty(3) + (1 - w(7)) * updated, 1, 10);
}

function recallStability(d: number, s: number, r: number, g: Rating): number {
  const hardPenalty = g === 2 ? w(15) : 1;
  const easyBonus = g === 4 ? w(16) : 1;
  return s * (Math.exp(w(8)) * (11 - d) * s ** -w(9) * (Math.exp(w(10) * (1 - r)) - 1) * hardPenalty * easyBonus + 1);
}

function forgetStability(d: number, s: number, r: number): number {
  return w(11) * d ** -w(12) * ((s + 1) ** w(13) - 1) * Math.exp(w(14) * (1 - r));
}

export function newCard(now: Date): CardState {
  return { stability: 0, difficulty: 0, reps: 0, lapses: 0, state: "NEW", lastReviewAt: null, dueAt: now };
}

export interface ReviewOutcome {
  card: CardState;
  elapsedDays: number;
  retrievabilityAtReview: number;
  recalled: boolean;
}

export function review(card: CardState, rating: Rating, now: Date): ReviewOutcome {
  const elapsedDays = card.lastReviewAt ? Math.max(0, (now.getTime() - card.lastReviewAt.getTime()) / DAY_MS) : 0;
  let stability: number;
  let difficulty: number;
  let lapses = card.lapses;
  let r = 1;
  if (card.state === "NEW" || card.stability <= 0) {
    stability = w(rating - 1);
    difficulty = initDifficulty(rating);
  } else {
    r = retrievability(elapsedDays, card.stability);
    difficulty = nextDifficulty(card.difficulty, rating);
    if (rating === 1) {
      stability = Math.min(forgetStability(card.difficulty, card.stability, r), card.stability);
      lapses += 1;
    } else {
      stability = recallStability(card.difficulty, card.stability, r, rating);
    }
  }
  stability = Math.max(0.1, stability);
  const state: CardStateName = rating === 1 ? (card.state === "NEW" ? "LEARNING" : "RELEARNING") : "REVIEW";
  // Failed items come back in 10 minutes; everything else follows the FSRS interval.
  const dueAt = rating === 1 ? new Date(now.getTime() + 10 * 60_000) : new Date(now.getTime() + intervalDays(stability) * DAY_MS);
  return {
    card: { stability: round(stability, 4), difficulty: round(difficulty, 4), reps: card.reps + 1, lapses, state, lastReviewAt: now, dueAt },
    elapsedDays: round(elapsedDays, 4),
    retrievabilityAtReview: round(r, 4),
    recalled: rating > 1,
  };
}

/** Deterministic rating from typed recall (CLAUDE.md § SRS). */
export function ratingFromRecall(expected: string, typed: string, responseMs: number): Rating {
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const e = norm(expected);
  const t = norm(typed);
  if (t.length === 0) return 1;
  if (e === t) return responseMs < 6000 ? 4 : 3;
  return levenshtein(e, t) <= 2 ? 2 : 1;
}

export function isOverdue(card: Pick<CardState, "dueAt" | "state">, now: Date): boolean {
  return card.state !== "NEW" && card.dueAt.getTime() <= now.getTime();
}

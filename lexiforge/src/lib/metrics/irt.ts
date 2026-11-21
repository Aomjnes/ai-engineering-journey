/**
 * 1PL (Rasch) ability estimation on the 0–100 level scale used by the placement audit.
 * P(correct | θ, b) = 1 / (1 + exp(−(θ − b) / s)), s = 10. MAP with a Normal(40, 25²) prior,
 * computed by exhaustive grid search (step 0.25) — deterministic and finite for all-correct/all-wrong.
 */

import { clamp } from "./text";

export const IRT_SCALE = 10;
const PRIOR_MEAN = 40;
const PRIOR_SD = 25;

export interface ItemResponse {
  difficulty: number; // b on the level scale
  correct: boolean;
}

export function pCorrect(theta: number, b: number): number {
  return 1 / (1 + Math.exp(-(theta - b) / IRT_SCALE));
}

export function logPosterior(theta: number, responses: readonly ItemResponse[]): number {
  let ll = -((theta - PRIOR_MEAN) ** 2) / (2 * PRIOR_SD ** 2);
  for (const r of responses) {
    const p = clamp(pCorrect(theta, r.difficulty), 1e-9, 1 - 1e-9);
    ll += r.correct ? Math.log(p) : Math.log(1 - p);
  }
  return ll;
}

export function estimateAbility(responses: readonly ItemResponse[]): number {
  let best = PRIOR_MEAN;
  let bestLl = -Infinity;
  for (let theta = 0; theta <= 100; theta += 0.25) {
    const ll = logPosterior(theta, responses);
    if (ll > bestLl) {
      bestLl = ll;
      best = theta;
    }
  }
  return best;
}

/** Standard error from the Fisher information at θ (plus prior information). */
export function abilityStandardError(theta: number, responses: readonly ItemResponse[]): number {
  let info = 1 / PRIOR_SD ** 2;
  for (const r of responses) {
    const p = pCorrect(theta, r.difficulty);
    info += (p * (1 - p)) / IRT_SCALE ** 2;
  }
  return 1 / Math.sqrt(info);
}

/** Picks the unused item whose difficulty is closest to the current θ (ties → lower index). */
export function pickNextItem<T extends { difficulty: number }>(items: readonly T[], usedIds: ReadonlySet<number>, theta: number): number | null {
  let bestIdx: number | null = null;
  let bestGap = Infinity;
  items.forEach((item, idx) => {
    if (usedIds.has(idx)) return;
    const gap = Math.abs(item.difficulty - theta);
    if (gap < bestGap) {
      bestGap = gap;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

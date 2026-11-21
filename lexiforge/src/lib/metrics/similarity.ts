/** Deterministic copy-paste detector. See CLAUDE.md § Copy-paste detector. */

import { ngramSet, splitSentences, tokenize } from "./text";

export const COPY_PASTE_THRESHOLD = 0.65;

export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function gramsFor(tokens: readonly string[], useUnigrams: boolean): Set<string> {
  return useUnigrams ? new Set(tokens) : ngramSet(tokens, 3);
}

export interface CopyCheck {
  maxJaccard: number;
  isCopy: boolean;
  matchedWindow: string | null;
}

/** Max trigram Jaccard between `answer` and every window of 1–3 consecutive source sentences. */
export function detectCopy(answer: string, source: string, threshold = COPY_PASTE_THRESHOLD): CopyCheck {
  const aTokens = tokenize(answer);
  if (aTokens.length === 0) return { maxJaccard: 0, isCopy: false, matchedWindow: null };
  const useUnigrams = aTokens.length < 3;
  const aSet = gramsFor(aTokens, useUnigrams);
  const sentences = splitSentences(source).map((s) => s.text);
  let best = 0;
  let bestWindow: string | null = null;
  for (let i = 0; i < sentences.length; i++) {
    for (let w = 1; w <= 3 && i + w <= sentences.length; w++) {
      const windowText = sentences.slice(i, i + w).join(" ");
      const sim = jaccard(aSet, gramsFor(tokenize(windowText), useUnigrams));
      if (sim > best) {
        best = sim;
        bestWindow = windowText;
      }
    }
  }
  return { maxJaccard: best, isCopy: best > threshold, matchedWindow: best > threshold ? bestWindow : null };
}

/** Whole-text trigram Jaccard (used to stop learners pasting the model's native upgrade). */
export function textJaccard(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const uni = ta.length < 3 || tb.length < 3;
  return jaccard(gramsFor(ta, uni), gramsFor(tb, uni));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

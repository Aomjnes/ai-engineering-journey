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

/** Word-level accuracy of a dictation/shadowing transcript: 1 − wordEditDistance / expectedWords (≥ 0). */
export function dictationAccuracy(expected: string, typed: string): number {
  const e = tokenize(expected);
  const t = tokenize(typed);
  if (e.length === 0) return 0;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= e.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = e[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return Math.max(0, 1 - (prev[t.length] ?? 0) / e.length);
}

// ───────────────────────────── Word-level diff (dictation & speaking) ─────────────────────────────

const NUMBER_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
  "11": "eleven", "12": "twelve", "15": "fifteen", "20": "twenty", "30": "thirty", "50": "fifty", "100": "hundred",
};

/** Lowercased word tokens with curly apostrophes normalized and small numbers spelled out (STT writes "2"). */
export function diffTokens(text: string): string[] {
  return tokenize(text).map((t) => NUMBER_WORDS[t] ?? t);
}

/** A typo of the same word: one edit, one adjacent swap, or ≤ 2 edits in words of 6+ letters. */
export function isMisspelling(expected: string, typed: string): boolean {
  const d = levenshtein(expected, typed);
  if (d <= 1) return true;
  if (expected.length >= 6 && d <= 2) return true;
  if (expected.length === typed.length) {
    const diff = [...expected].map((c, i) => (c === typed[i] ? -1 : i)).filter((i) => i >= 0);
    if (diff.length === 2 && diff[1] === (diff[0] as number) + 1 && expected[diff[0] as number] === typed[diff[1] as number] && expected[diff[1] as number] === typed[diff[0] as number]) return true;
  }
  return false;
}

export type WordOp =
  | { type: "ok"; expected: string; typed: string }
  | { type: "misspelled"; expected: string; typed: string }
  | { type: "wrong"; expected: string; typed: string }
  | { type: "missing"; expected: string }
  | { type: "extra"; typed: string };

export interface WordDiff {
  ops: WordOp[];
  correct: number;
  expectedCount: number;
  /** correct / expected words (0–1). */
  accuracy: number;
  perfect: boolean;
}

/**
 * Minimum-edit alignment of typed vs expected words (match 0, substitution/insertion/deletion 1).
 * Substitutions within a small Levenshtein distance are "misspelled", otherwise "wrong".
 */
export function wordDiff(expected: string, typed: string): WordDiff {
  const e = diffTokens(expected);
  const t = diffTokens(typed);
  const n = e.length;
  const m = t.length;
  const dp: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = (dp[i - 1]?.[j - 1] ?? 0) + (e[i - 1] === t[j - 1] ? 0 : 1);
      (dp[i] as number[])[j] = Math.min(sub, (dp[i - 1]?.[j] ?? 0) + 1, (dp[i]?.[j - 1] ?? 0) + 1);
    }
  }
  const ops: WordOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const cur = dp[i]?.[j] ?? 0;
    if (i > 0 && j > 0 && cur === (dp[i - 1]?.[j - 1] ?? 0) + (e[i - 1] === t[j - 1] ? 0 : 1)) {
      const ew = e[i - 1] as string;
      const tw = t[j - 1] as string;
      if (ew === tw) ops.push({ type: "ok", expected: ew, typed: tw });
      else ops.push({ type: isMisspelling(ew, tw) ? "misspelled" : "wrong", expected: ew, typed: tw });
      i--;
      j--;
    } else if (i > 0 && cur === (dp[i - 1]?.[j] ?? 0) + 1) {
      ops.push({ type: "missing", expected: e[i - 1] as string });
      i--;
    } else {
      ops.push({ type: "extra", typed: t[j - 1] as string });
      j--;
    }
  }
  ops.reverse();
  const correct = ops.filter((o) => o.type === "ok").length;
  return { ops, correct, expectedCount: n, accuracy: n === 0 ? 0 : correct / n, perfect: correct === n && m === n };
}

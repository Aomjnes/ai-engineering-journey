/** Deterministic text-complexity profiler and article CEFR classifier. See CLAUDE.md § Readability. */

import { clamp, countSyllables, isCoreWord, round, splitSentences, tokenize } from "./text";

export type CefrTier = "A2" | "B1" | "B2" | "C1";

export interface ComplexityProfile {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  avgSyllablesPerWord: number;
  fleschKincaidGrade: number;
  fleschReadingEase: number;
  lexicalSophistication: number; // 0–1
  difficultyScore: number; // 0–100 on the shared level scale
  cefrTier: CefrTier;
}

export function fleschKincaidGrade(words: number, sentences: number, syllables: number): number {
  if (words === 0 || sentences === 0) return 0;
  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

export function fleschReadingEase(words: number, sentences: number, syllables: number): number {
  if (words === 0 || sentences === 0) return 0;
  return 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
}

/** Share of alphabetic tokens (length ≥ 3) whose lemma is outside the core band. */
export function lexicalSophistication(tokens: readonly string[]): number {
  const candidates = tokens.filter((t) => /^[a-z']+$/.test(t) && t.length >= 3);
  if (candidates.length === 0) return 0;
  const rare = candidates.filter((t) => !isCoreWord(t)).length;
  return rare / candidates.length;
}

/** Raw text complexity R ∈ [0, 100] from Flesch-Kincaid grade and lexical sophistication. */
export function rawComplexity(fkGrade: number, sophistication: number): number {
  const fk = clamp((fkGrade - 4) / 12, 0, 1);
  const ls = clamp((sophistication - 0.05) / 0.3, 0, 1);
  return clamp(60 * fk + 40 * ls, 0, 100);
}

/** Piecewise-linear map from raw complexity to the shared level scale (anchors raw → level). */
const LEVEL_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 15], [12.5, 34], [25, 53], [50, 69], [75, 83], [100, 100],
];

export function levelFromRaw(raw: number): number {
  const r = clamp(raw, 0, 100);
  for (let i = 1; i < LEVEL_ANCHORS.length; i++) {
    const [x0, y0] = LEVEL_ANCHORS[i - 1] as readonly [number, number];
    const [x1, y1] = LEVEL_ANCHORS[i] as readonly [number, number];
    if (r <= x1) return y0 + ((r - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 100;
}

/** Difficulty D on the shared 0–100 level scale (Pre-A1 0 … C1.2 90+). */
export function difficultyFrom(fkGrade: number, sophistication: number): number {
  return levelFromRaw(rawComplexity(fkGrade, sophistication));
}

/** Article tier: A2 (D < 53) · B1 (< 69) · B2 (< 83) · C1. */
export function tierFromDifficulty(d: number): CefrTier {
  if (d < 53) return "A2";
  if (d < 69) return "B1";
  if (d < 83) return "B2";
  return "C1";
}

export function profileText(text: string): ComplexityProfile {
  const tokens = tokenize(text);
  const words = tokens.length;
  const sentences = Math.max(1, splitSentences(text).length);
  const syllables = tokens.reduce((acc, t) => acc + (/^\d/.test(t) ? 1 : countSyllables(t)), 0);
  const fk = fleschKincaidGrade(words, sentences, syllables);
  const fre = fleschReadingEase(words, sentences, syllables);
  const ls = lexicalSophistication(tokens);
  const d = words === 0 ? 0 : difficultyFrom(fk, ls);
  return {
    wordCount: words,
    sentenceCount: words === 0 ? 0 : sentences,
    avgSentenceLength: words === 0 ? 0 : round(words / sentences, 2),
    avgSyllablesPerWord: words === 0 ? 0 : round(syllables / words, 3),
    fleschKincaidGrade: round(fk, 2),
    fleschReadingEase: round(fre, 2),
    lexicalSophistication: round(ls, 4),
    difficultyScore: round(d, 2),
    cefrTier: tierFromDifficulty(d),
  };
}

/** Share of tokens a learner likely knows: core band + their own SRS deck (lemmas). */
export function comprehensibility(text: string, knownLemmas: ReadonlySet<string> = new Set()): number {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 1;
  const known = tokens.filter((t) => isCoreWord(t, knownLemmas)).length;
  return round(known / tokens.length, 4);
}

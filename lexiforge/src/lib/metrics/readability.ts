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

/** Difficulty D on the 0–100 level scale (12.5 per CEFR sub-band). */
export function difficultyFrom(fkGrade: number, sophistication: number): number {
  const fk = clamp((fkGrade - 4) / 12, 0, 1);
  const ls = clamp((sophistication - 0.05) / 0.3, 0, 1);
  return clamp(60 * fk + 40 * ls, 0, 100);
}

export function tierFromDifficulty(d: number): CefrTier {
  if (d < 25) return "A2";
  if (d < 50) return "B1";
  if (d < 75) return "B2";
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

import { isCoreWord, tokenize } from "@/lib/metrics/text";

export interface GuardResult {
  ok: boolean;
  code?: "EMPTY" | "TOO_SHORT" | "TOO_LONG" | "NOT_ENGLISH" | "GIBBERISH" | "REPETITIVE";
  message?: string;
}

/**
 * Deterministic garbage filter applied before any LLM call. Real English prose always contains a large
 * share of core-band words (function words alone are ~40% of running text).
 */
export function guardSubmission(text: string, opts: { minWords: number; maxWords: number }): GuardResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, code: "EMPTY", message: "Submission is empty." };
  const tokens = tokenize(trimmed);
  if (tokens.length < opts.minWords) return { ok: false, code: "TOO_SHORT", message: `Minimum ${opts.minWords} words; you wrote ${tokens.length}.` };
  if (tokens.length > opts.maxWords) return { ok: false, code: "TOO_LONG", message: `Maximum ${opts.maxWords} words; you wrote ${tokens.length}.` };
  const letters = trimmed.replace(/[^\p{L}]/gu, "");
  const latin = letters.replace(/[^A-Za-z]/g, "");
  if (letters.length > 0 && latin.length / letters.length < 0.9) return { ok: false, code: "NOT_ENGLISH", message: "Write in English. Vietnamese or other scripts are not accepted here." };
  const words = tokens.filter((t) => /^[a-z]/.test(t));
  const coreShare = words.length === 0 ? 0 : words.filter((t) => isCoreWord(t)).length / words.length;
  if (tokens.length >= 4 && coreShare < 0.3) return { ok: false, code: "GIBBERISH", message: "This does not read as English sentences. Submit real prose." };
  if (tokens.length >= 8 && new Set(tokens).size / tokens.length < 0.25) return { ok: false, code: "REPETITIVE", message: "Submission is mostly repeated words." };
  return { ok: true };
}

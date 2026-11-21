/** Deterministic text primitives shared by every metric. Pure functions, no I/O. */

import { CORE_VOCAB } from "./core-vocab";

export interface SentenceSpan {
  text: string;
  start: number;
  end: number; // exclusive
}

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "inc", "ltd", "co", "corp",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "no", "fig", "u.s", "u.k", "e.g", "i.e",
]);

/** Splits text into sentences with character offsets. Handles common abbreviations and decimals. */
export function splitSentences(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let start = 0;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    const isTerminal = ch === "." || ch === "!" || ch === "?";
    const isBreak = ch === "\n" && text[i + 1] === "\n";
    if (!isTerminal && !isBreak) continue;

    if (ch === ".") {
      const prev = text[i - 1] ?? "";
      const next = text[i + 1] ?? "";
      if (/\d/.test(prev) && /\d/.test(next)) continue; // 3.5
      const wordBefore = /([A-Za-z.]+)$/.exec(text.slice(Math.max(0, i - 12), i))?.[1]?.toLowerCase() ?? "";
      if (ABBREVIATIONS.has(wordBefore)) continue;
      if (/^[A-Za-z]$/.test(wordBefore)) continue; // initials: "J. K."
    }
    let end = i + 1;
    while (end < n && /["'”’)\]!?.]/.test(text[end] ?? "")) end++;
    if (isTerminal && end < n && !/\s/.test(text[end] ?? "")) continue; // "e.g.x", URLs
    pushSpan(text, start, end, spans);
    start = end;
    i = end - 1;
  }
  pushSpan(text, start, n, spans);
  return spans;
}

function pushSpan(text: string, start: number, end: number, out: SentenceSpan[]): void {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s] ?? "")) s++;
  while (e > s && /\s/.test(text[e - 1] ?? "")) e--;
  if (e > s && /[A-Za-z0-9]/.test(text.slice(s, e))) out.push({ text: text.slice(s, e), start: s, end: e });
}

const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*|\d+(?:[.,]\d+)*/g;

/** Lowercased word tokens (letters with internal apostrophes, or numbers). */
export function tokenize(text: string): string[] {
  return (text.match(WORD_RE) ?? []).map((t) => t.toLowerCase().replace(/’/g, "'"));
}

/** Word count consistent with tokenize(). */
export function countWords(text: string): number {
  return tokenize(text).length;
}

/** Heuristic English syllable counter (Flesch-Kincaid standard practice). */
export function countSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "");
  w = w.replace(/^y/, "");
  const groups = w.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Candidate lemmas for a lowercased token, via conservative suffix stripping. */
export function lemmaCandidates(token: string): string[] {
  const t = token.replace(/'s$|'$/, "");
  const out = new Set<string>([t]);
  const rules: Array<[RegExp, string]> = [
    [/ies$/, "y"], [/ied$/, "y"], [/ier$/, "y"], [/iest$/, "y"], [/ily$/, "y"],
    [/sses$/, "ss"], [/(ch|sh|x|z|o)es$/, "$1"], [/s$/, ""],
    [/ing$/, ""], [/ing$/, "e"], [/ed$/, ""], [/ed$/, "e"], [/d$/, ""],
    [/er$/, ""], [/er$/, "e"], [/est$/, ""], [/est$/, "e"], [/ly$/, ""], [/ment$/, ""], [/ness$/, ""],
  ];
  for (const [re, rep] of rules) {
    if (!re.test(t)) continue;
    const base = t.replace(re, rep);
    if (base.length < 2) continue;
    out.add(base);
    // doubled consonant: stopped -> stopp -> stop, running -> runn -> run
    if (/([b-df-hj-np-tv-z])\1$/.test(base)) out.add(base.slice(0, -1));
  }
  return [...out];
}

const IRREGULAR: Record<string, string> = {
  was: "be", were: "be", is: "be", are: "be", been: "be", being: "be", am: "be",
  had: "have", has: "have", did: "do", does: "do", done: "do", went: "go", gone: "go",
  said: "say", made: "make", took: "take", taken: "take", came: "come", saw: "see", seen: "see",
  knew: "know", known: "know", got: "get", gotten: "get", gave: "give", given: "give", found: "find",
  thought: "think", told: "tell", became: "become", left: "leave", felt: "feel", brought: "bring",
  began: "begin", begun: "begin", kept: "keep", held: "hold", wrote: "write", written: "write",
  stood: "stand", heard: "hear", meant: "mean", met: "meet", ran: "run", paid: "pay", sat: "sit",
  spoke: "speak", spoken: "speak", lay: "lie", led: "lead", grew: "grow", grown: "grow", lost: "lose",
  fell: "fall", fallen: "fall", sent: "send", built: "build", understood: "understand", drew: "draw",
  broke: "break", broken: "break", spent: "spend", rose: "rise", risen: "rise", drove: "drive",
  bought: "buy", wore: "wear", chose: "choose", chosen: "choose", ate: "eat", eaten: "eat",
  children: "child", men: "man", women: "woman", people: "person", feet: "foot", teeth: "tooth",
  better: "good", best: "good", worse: "bad", worst: "bad", "n't": "not", "can't": "can", "won't": "will",
  "don't": "do", "doesn't": "do", "didn't": "do", "isn't": "be", "aren't": "be", "wasn't": "be",
  "i'm": "i", "it's": "it", "that's": "that", "there's": "there", "they're": "they", "we're": "we",
  "you're": "you", "i've": "i", "we've": "we", "they've": "they", "i'll": "i", "you'll": "you",
};

/** True when the token (or a lemma of it) is in the core high-frequency band. Numbers count as core. */
export function isCoreWord(token: string, extraKnown?: ReadonlySet<string>): boolean {
  if (/^\d/.test(token)) return true;
  const irregular = IRREGULAR[token];
  if (irregular && CORE_VOCAB.has(irregular)) return true;
  for (const cand of lemmaCandidates(token)) {
    if (CORE_VOCAB.has(cand) || extraKnown?.has(cand)) return true;
  }
  return extraKnown?.has(token) ?? false;
}

/** Word n-gram set (tokens joined by a space). */
export function ngramSet(tokens: readonly string[], n: number): Set<string> {
  const out = new Set<string>();
  if (tokens.length < n) return out;
  for (let i = 0; i + n <= tokens.length; i++) out.add(tokens.slice(i, i + n).join(" "));
  return out;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function round(x: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** Leading whole sentences totalling at least `minWords` words (or the whole text), paragraph breaks kept. */
export function excerptByWords(text: string, minWords: number): string {
  const paragraphs = text.split(/\n{2,}/);
  const out: string[] = [];
  let words = 0;
  for (const para of paragraphs) {
    const kept: string[] = [];
    for (const s of splitSentences(para)) {
      kept.push(s.text);
      words += countWords(s.text);
      if (words >= minWords) break;
    }
    if (kept.length) out.push(kept.join(" "));
    if (words >= minWords) break;
  }
  return out.join("\n\n");
}

/** Deterministically picks a shadowing sentence (8–28 words) from text using a string seed. */
export function pickShadowSentence(text: string, seed: string): SentenceSpan | null {
  const candidates = splitSentences(text).filter((s) => {
    const n = countWords(s.text);
    return n >= 8 && n <= 28;
  });
  if (candidates.length === 0) return splitSentences(text)[0] ?? null;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return candidates[h % candidates.length] ?? null;
}

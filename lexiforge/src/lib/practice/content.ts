/**
 * LLM-generated, deterministically validated practice items. The LLM writes sentences; code checks length,
 * difficulty, IPA shape and distractor rules before anything is shown.
 */

import { z } from "zod";
import { generateStructured } from "@/lib/llm/structured";
import type { LlmClient } from "@/lib/llm/client";
import { JSON_ONLY, findBannedPraise } from "@/lib/llm/prompts";
import { profileText } from "@/lib/metrics/readability";
import { bandIndex, bandLabel, type SubBand } from "@/lib/metrics/scoring";
import { tokenize } from "@/lib/metrics/text";

export type LevelGroup = "BEGINNER" | "ELEMENTARY" | "INTERMEDIATE" | "ADVANCED";

export function levelGroup(b: SubBand): LevelGroup {
  const i = bandIndex(b);
  if (i <= bandIndex("A1_2")) return "BEGINNER";
  if (i <= bandIndex("A2_2")) return "ELEMENTARY";
  if (i <= bandIndex("B1_2")) return "INTERMEDIATE";
  return "ADVANCED";
}

/** Word-count windows per level group. */
export const LENGTHS: Record<"DICTATION" | "SPEAKING" | "SENTENCE", Record<LevelGroup, [number, number]>> = {
  DICTATION: { BEGINNER: [3, 7], ELEMENTARY: [5, 11], INTERMEDIATE: [8, 16], ADVANCED: [11, 22] },
  SPEAKING: { BEGINNER: [2, 6], ELEMENTARY: [4, 9], INTERMEDIATE: [6, 13], ADVANCED: [8, 16] },
  SENTENCE: { BEGINNER: [3, 7], ELEMENTARY: [5, 10], INTERMEDIATE: [7, 14], ADVANCED: [9, 18] },
};

export const ITEMS_PER_SESSION = 5;
const words = (s: string) => tokenize(s).length;
const inRange = (n: number, [lo, hi]: [number, number]) => n >= lo && n <= hi;

export interface Topic {
  headline: string | null;
  milestone: string | null;
}

function topicLine(t: Topic): string {
  return [t.headline ? `Today's real news headline: "${t.headline}"` : null, t.milestone ? `Current roadmap step: ${t.milestone}` : null].filter(Boolean).join("\n") || "Everyday life";
}

/** Max text difficulty allowed for a level: one sub-band of stretch above the learner. */
export const maxDifficultyFor = (level: number) => Math.max(30, level + 15);

// ───────────────────────────── Dictation ─────────────────────────────

export const DictationSetSchema = z.object({ items: z.array(z.object({ text: z.string().min(3).max(220), vi: z.string().min(2).max(240) })).length(ITEMS_PER_SESSION) });
export type DictationSet = z.infer<typeof DictationSetSchema>;

export function verifyDictation(v: DictationSet, band: SubBand, level: number): string | null {
  const range = LENGTHS.DICTATION[levelGroup(band)];
  const bad = v.items.filter((i) => !inRange(words(i.text), range));
  if (bad.length) return `Each sentence must have ${range[0]}–${range[1]} words; fix: ${bad.map((b) => JSON.stringify(b.text)).join(", ")}`;
  const d = profileText(v.items.map((i) => i.text).join(" ")).difficultyScore;
  if (d > maxDifficultyFor(level)) return `Sentences are too hard (difficulty ${d.toFixed(1)}); use shorter, more common words.`;
  if (new Set(v.items.map((i) => i.text.toLowerCase())).size !== v.items.length) return "Sentences must be different.";
  return null;
}

export async function generateDictation(band: SubBand, level: number, topic: Topic, client?: LlmClient): Promise<DictationSet> {
  const range = LENGTHS.DICTATION[levelGroup(band)];
  return generateStructured({
    schema: DictationSetSchema,
    system: "You write natural, real-world English sentences for listening dictation. Output JSON only.",
    user: `Learner: CEFR ${bandLabel(band)}. ${topicLine(topic)}
Write ${ITEMS_PER_SESSION} natural spoken-English sentences related to the topic (or everyday life for beginners), each ${range[0]}–${range[1]} words, with a natural Vietnamese translation in "vi". Use common contractions sometimes. No names that are hard to spell.
JSON: {"items":[{"text","vi"}]}
${JSON_ONLY}`,
    tier: "standard",
    client,
    validate: (v) => verifyDictation(v, band, level),
  });
}

// ───────────────────────────── Speaking & IPA ─────────────────────────────

export const SpeakingSetSchema = z.object({
  items: z.array(z.object({ text: z.string().min(2).max(160), ipa: z.string().min(3).max(260), tipVi: z.string().min(5).max(240), tipEn: z.string().min(5).max(240) })).length(ITEMS_PER_SESSION),
});
export type SpeakingSet = z.infer<typeof SpeakingSetSchema>;

export function verifySpeaking(v: SpeakingSet, band: SubBand): string | null {
  const range = LENGTHS.SPEAKING[levelGroup(band)];
  const bad = v.items.filter((i) => !inRange(words(i.text), range));
  if (bad.length) return `Each phrase must have ${range[0]}–${range[1]} words; fix: ${bad.map((b) => JSON.stringify(b.text)).join(", ")}`;
  const noIpa = v.items.filter((i) => !/^\/.+\/$/.test(i.ipa.trim()));
  if (noIpa.length) return `"ipa" must be a broad IPA transcription wrapped in slashes, e.g. /ˈwɔːtər/; fix: ${noIpa.map((b) => JSON.stringify(b.text)).join(", ")}`;
  const praise = findBannedPraise(v.items.map((i) => i.tipEn).join(" "));
  return praise ? `Remove praise ("${praise}").` : null;
}

export async function generateSpeaking(band: SubBand, topic: Topic, client?: LlmClient): Promise<SpeakingSet> {
  const range = LENGTHS.SPEAKING[levelGroup(band)];
  return generateStructured({
    schema: SpeakingSetSchema,
    system: "You are a pronunciation coach for Vietnamese speakers. Output JSON only.",
    user: `Learner: CEFR ${bandLabel(band)}. ${topicLine(topic)}
Write ${ITEMS_PER_SESSION} natural phrases to say aloud (${range[0]}–${range[1]} words each) that practise sounds Vietnamese speakers find hard: final consonants (/s/, /t/, /d/, -ed, -s), /θ/ /ð/, /ʃ/, consonant clusters, linking.
For each: "ipa" = broad General American IPA of the WHOLE phrase in slashes; "tipVi" = one concrete tip in plain Vietnamese (no jargon), "tipEn" = the same tip in English.
JSON: {"items":[{"text","ipa","tipVi","tipEn"}]}
${JSON_ONLY}`,
    tier: "standard",
    client,
    validate: (v) => verifySpeaking(v, band),
  });
}

// ───────────────────────────── Sentence builder (Vietnamese → English) ─────────────────────────────

export const SentenceSetSchema = z.object({
  items: z
    .array(
      z.object({
        vi: z.string().min(3).max(240),
        en: z.string().min(3).max(240),
        accepted: z.array(z.string().min(3).max(240)).max(4),
        distractors: z.array(z.string().min(1).max(20)).min(1).max(2),
        trapVi: z.string().min(5).max(240),
      }),
    )
    .length(ITEMS_PER_SESSION),
});
export type SentenceSet = z.infer<typeof SentenceSetSchema>;

export function verifySentences(v: SentenceSet, band: SubBand): string | null {
  const range = LENGTHS.SENTENCE[levelGroup(band)];
  const problems: string[] = [];
  for (const i of v.items) {
    if (!inRange(words(i.en), range)) problems.push(`"${i.en}" must have ${range[0]}–${range[1]} words`);
    const toks = new Set(tokenize(i.en));
    const badD = i.distractors.filter((d) => tokenize(d).length !== 1 || toks.has(tokenize(d)[0] as string));
    if (badD.length) problems.push(`distractors for "${i.en}" must be single words NOT in the answer (${badD.join(", ")})`);
  }
  return problems.length ? `Fix: ${problems.join("; ")}.` : null;
}

export async function generateSentences(band: SubBand, topic: Topic, client?: LlmClient): Promise<SentenceSet> {
  const range = LENGTHS.SENTENCE[levelGroup(band)];
  return generateStructured({
    schema: SentenceSetSchema,
    system: "You design Vietnamese → English sentence-building drills that target typical Vietlish errors. Output JSON only.",
    user: `Learner: CEFR ${bandLabel(band)}. ${topicLine(topic)}
Write ${ITEMS_PER_SESSION} realistic everyday Vietnamese sentences ("vi") whose natural English translation ("en", ${range[0]}–${range[1]} words) contains a classic Vietlish trap (missing "be", word order of adjectives/questions, "very like", "discuss about", missing article or plural -s, wrong tense).
"accepted": up to 4 other fully natural English translations. "distractors": 1–2 single trap words a Vietnamese speaker would wrongly add (NOT in "en"). "trapVi": the trap explained in one plain Vietnamese sentence.
JSON: {"items":[{"vi","en","accepted":[],"distractors":[],"trapVi"}]}
${JSON_ONLY}`,
    tier: "standard",
    client,
    validate: (v) => verifySentences(v, band),
  });
}

/** Deterministic word-chip shuffle (stable per item) — answer words + distractors. */
export function chipsFor(en: string, distractors: string[], seed: string): string[] {
  const chips = [...en.replace(/[.!?]+$/, "").split(/\s+/), ...distractors];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const out = [...chips];
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j] as string, out[i] as string];
  }
  // Never present the chips already in the correct order.
  if (out.join(" ") === chips.join(" ") && out.length > 1) [out[0], out[1]] = [out[1] as string, out[0] as string];
  return out;
}

export const normSentence = (s: string) => tokenize(s).join(" ");

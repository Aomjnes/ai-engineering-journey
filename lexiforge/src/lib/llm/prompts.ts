/** Shared prompt fragments. The anti-sycophancy contract is enforced in code, not only requested. */

export const BANNED_PRAISE = [
  "great job", "good job", "nice try", "almost there", "well done", "excellent work", "great work", "awesome",
  "fantastic", "amazing", "keep it up", "you're doing great", "good effort", "nice work", "impressive", "bravo",
  "great effort", "perfect!", "keep up the good work", "don't worry",
] as const;

export function findBannedPraise(text: string): string | null {
  const lower = text.toLowerCase();
  return BANNED_PRAISE.find((p) => lower.includes(p)) ?? null;
}

export const EDITOR_PERSONA = `You are a senior copy editor and applied linguist auditing English written by a Vietnamese learner.
Tone: direct, objective, surgical. You NEVER praise, encourage, soften, or reassure. Forbidden phrases include: ${BANNED_PRAISE.map((p) => `"${p}"`).join(", ")}.
State facts about the text only. Vietnamese explanations must be natural Vietnamese (có dấu).
You never output numeric scores, grades, bands or percentages — the application computes all scores deterministically from your evidence.`;

export const ERROR_TAXONOMY = `ERROR TAXONOMY (category → typical subtypes, UPPER_SNAKE_CASE):
- GRAMMAR: TENSE_SHIFT, TENSE_FORM, SV_AGREEMENT, ARTICLE_OMISSION, ARTICLE_MISUSE, PLURAL_OMISSION, COUNTABILITY, PREPOSITION_MISUSE, PREPOSITION_CALQUE, WORD_ORDER, VERB_PATTERN, PASSIVE_FORM, CONJUNCTION_DOUBLING (e.g. "Although ... but"), RUN_ON_SENTENCE, FRAGMENT, PRONOUN_REFERENCE
- COLLOCATION_NATURALNESS: grammatical but unnatural or translated from Vietnamese — VIETLISH_CALQUE ("open the light", "very like"), UNNATURAL_COLLOCATION ("do a mistake")
- WORD_CHOICE_REGISTER: REGISTER_MISMATCH, WRONG_NUANCE
- SPELLING_PUNCTUATION: SPELLING, PUNCTUATION, CAPITALIZATION
- LOGIC_COMPREHENSION: MISREAD_SOURCE, OFF_PROMPT, UNSUPPORTED_CLAIM
SEVERITY: CRITICAL = breaks meaning or is a core-grammar failure a B1 reader notices immediately; MODERATE = clearly wrong but meaning survives; MINOR = small slip or stylistic issue.
Report EVERY error, each once. "original" must be copied character-for-character from the learner text, and start/end must be its 0-based character offsets (end exclusive).`;

export const JSON_ONLY = "Return ONLY one JSON object that matches the schema. No markdown fences, no prose before or after.";

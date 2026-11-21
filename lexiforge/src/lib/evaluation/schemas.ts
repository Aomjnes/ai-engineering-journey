import { z } from "zod";

export const SeveritySchema = z.enum(["CRITICAL", "MODERATE", "MINOR"]);
export const ErrorCategorySchema = z.enum(["GRAMMAR", "COLLOCATION_NATURALNESS", "WORD_CHOICE_REGISTER", "SPELLING_PUNCTUATION", "LOGIC_COMPREHENSION"]);

export const SUBTYPE_EXAMPLES = [
  "ARTICLE_OMISSION", "ARTICLE_MISUSE", "TENSE_SHIFT", "TENSE_FORM", "SV_AGREEMENT", "PLURAL_OMISSION", "PREPOSITION_CALQUE",
  "PREPOSITION_MISUSE", "WORD_ORDER", "RUN_ON_SENTENCE", "FRAGMENT", "CONJUNCTION_DOUBLING", "VERB_PATTERN", "PASSIVE_FORM",
  "COUNTABILITY", "PRONOUN_REFERENCE", "VIETLISH_CALQUE", "UNNATURAL_COLLOCATION", "REGISTER_MISMATCH", "WRONG_NUANCE",
  "SPELLING", "PUNCTUATION", "CAPITALIZATION", "MISREAD_SOURCE", "OFF_PROMPT", "UNSUPPORTED_CLAIM",
] as const;

/** One error as reported by the LLM. Offsets are verified/repaired deterministically (spans.ts). */
export const EvidenceErrorSchema = z.object({
  original: z.string().min(1).max(400),
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  correction: z.string().max(400),
  category: ErrorCategorySchema,
  subtype: z.string().regex(/^[A-Z][A-Z0-9_]{2,40}$/, "subtype must be UPPER_SNAKE_CASE"),
  severity: SeveritySchema,
  ruleEn: z.string().min(3).max(400),
  ruleVi: z.string().min(3).max(400),
});
export type EvidenceError = z.infer<typeof EvidenceErrorSchema>;

export const ChunkUsageSchema = z.object({
  chunk: z.string().min(1),
  used: z.boolean(),
  usedCorrectly: z.boolean(),
  note: z.string().max(300),
});

export const WritingEvidenceSchema = z.object({
  errors: z.array(EvidenceErrorSchema).max(80),
  chunkUsage: z.array(ChunkUsageSchema),
  offPrompt: z.boolean(),
  nativeUpgrade: z.string().min(1).max(4000),
  verdictEn: z.string().min(5).max(800),
  verdictVi: z.string().min(5).max(800),
});
export type WritingEvidence = z.infer<typeof WritingEvidenceSchema>;

export const RubricCheckSchema = z.object({
  criterion: z.string().min(1),
  met: z.boolean(),
  evidence: z.string().max(400),
});

export const ComprehensionEvidenceSchema = z.object({
  rubric: z.array(RubricCheckSchema).min(1),
  misreadSource: z.boolean(),
  errors: z.array(EvidenceErrorSchema).max(30),
  verdictEn: z.string().min(5).max(600),
  verdictVi: z.string().min(5).max(600),
});
export type ComprehensionEvidence = z.infer<typeof ComprehensionEvidenceSchema>;

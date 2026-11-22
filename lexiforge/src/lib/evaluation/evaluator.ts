/**
 * Strict Diagnostic Engine. The LLM supplies linguistic evidence only; every number is computed by
 * src/lib/metrics. Evidence is Zod-validated, praise-filtered, span-verified, and retried on failure.
 */

import { generateStructured } from "@/lib/llm/structured";
import type { LlmClient } from "@/lib/llm/client";
import { EDITOR_PERSONA, ERROR_TAXONOMY, JSON_ONLY, findBannedPraise } from "@/lib/llm/prompts";
import { computeGai, computeLri, repairGate, type GaiResult, type LriResult, type RepairGate, type ScoredError } from "@/lib/metrics/scoring";
import { chunkPresent } from "./chunks";
import { ComprehensionEvidenceSchema, WritingEvidenceSchema, type ComprehensionEvidence, type EvidenceError, type WritingEvidence } from "./schemas";
import { repairSpans } from "./spans";

export interface WritingTask {
  text: string;
  prompt: string;
  sourceText?: string;
  requiredChunks: string[];
  /** How many chunks must be used correctly (defaults to all listed). Production lessons require 3. */
  chunkRequirement?: number;
  /** "production" | "rewrite" | "diagnostic" | "exit" — changes only the instructions, never the math. */
  mode: "production" | "rewrite" | "diagnostic" | "exit" | "detox";
  focusSubtype?: string;
}

export interface ChunkVerification {
  chunk: string;
  present: boolean; // deterministic
  llmUsedCorrectly: boolean;
  counted: boolean; // present AND llmUsedCorrectly
  note: string;
}

export interface WritingEvaluation {
  errors: EvidenceError[];
  droppedSpans: number;
  gai: GaiResult;
  lri: LriResult;
  chunks: ChunkVerification[];
  gate: RepairGate;
  offPrompt: boolean;
  nativeUpgrade: string;
  verdictEn: string;
  verdictVi: string;
}

export const toScored = (errors: readonly EvidenceError[]): ScoredError[] =>
  errors.map((e) => ({ start: e.start, end: e.end, category: e.category, subtype: e.subtype, severity: e.severity }));

function writingPrompt(task: WritingTask): string {
  const chunkList = task.requiredChunks.length ? task.requiredChunks.map((c) => `- "${c}"`).join("\n") : "(none)";
  const modeNote: Record<WritingTask["mode"], string> = {
    production: "This is an active-production task tied to a news article.",
    rewrite: "This is a forced rewrite after a failed Error-Repair Gate. Audit it from scratch; do not assume earlier errors were fixed.",
    diagnostic: "This is an unassisted placement writing sample. Audit it exactly as a placement examiner would.",
    exit: "This is a single exit-ticket sentence that must use the target chunk naturally in an original real-world context.",
    detox: `This is an Error Detox repair of a recurring ${task.focusSubtype ?? "error"} pattern. Check that pattern with extra care.`,
  };
  return `${modeNote[task.mode]}

TASK PROMPT GIVEN TO THE LEARNER:
${task.prompt}
${task.sourceText ? `\nSOURCE TEXT (for checking misreadings / off-prompt):\n${task.sourceText.slice(0, 6000)}\n` : ""}
REQUIRED LEXICAL CHUNKS:
${chunkList}

LEARNER TEXT (character offsets start at 0):
<<<${task.text}>>>

${ERROR_TAXONOMY}

OUTPUT SCHEMA:
{
  "errors": [{"original": string, "start": int, "end": int, "correction": string, "category": "GRAMMAR"|"COLLOCATION_NATURALNESS"|"WORD_CHOICE_REGISTER"|"SPELLING_PUNCTUATION"|"LOGIC_COMPREHENSION", "subtype": "UPPER_SNAKE", "severity": "CRITICAL"|"MODERATE"|"MINOR", "ruleEn": string, "ruleVi": string}],
  "chunkUsage": [{"chunk": string (exactly as listed), "used": boolean, "usedCorrectly": boolean, "note": string}],   // one entry per required chunk, [] if none
  "offPrompt": boolean,
  "nativeUpgrade": string,   // the whole text rewritten as a careful native writer would, same meaning
  "verdictEn": string,       // 1–3 sentences: what is wrong and the single highest-impact fix. No praise.
  "verdictVi": string        // same verdict in Vietnamese
}
${JSON_ONLY}`;
}

export async function evaluateWriting(task: WritingTask, client?: LlmClient): Promise<WritingEvaluation> {
  let repairedSpans: ReturnType<typeof repairSpans> | null = null;
  const evidence: WritingEvidence = await generateStructured({
    schema: WritingEvidenceSchema,
    system: EDITOR_PERSONA,
    user: writingPrompt(task),
    tier: "thorough",
    client,
    validate: (v) => {
      const praise = findBannedPraise(`${v.verdictEn} ${v.chunkUsage.map((c) => c.note).join(" ")}`);
      if (praise) return `Banned praise phrase "${praise}" found. Remove all praise; state facts only.`;
      const listed = new Set(task.requiredChunks.map((c) => c.toLowerCase()));
      const missing = [...listed].filter((c) => !v.chunkUsage.some((u) => u.chunk.toLowerCase() === c));
      if (missing.length) return `chunkUsage is missing entries for: ${missing.join(", ")}`;
      const r = repairSpans(task.text, v.errors);
      if (v.errors.length > 0 && r.dropped.length / v.errors.length > 0.3) {
        return `These "original" strings do not occur in the learner text: ${r.dropped.map((d) => JSON.stringify(d.original)).join(", ")}. Copy spans exactly.`;
      }
      repairedSpans = r;
      return null;
    },
  });
  const spans = repairedSpans ?? repairSpans(task.text, evidence.errors);
  const errors = spans.errors;
  const chunks: ChunkVerification[] = task.requiredChunks.map((chunk) => {
    const usage = evidence.chunkUsage.find((u) => u.chunk.toLowerCase() === chunk.toLowerCase());
    const present = chunkPresent(task.text, chunk);
    const llmOk = usage?.usedCorrectly ?? false;
    return { chunk, present, llmUsedCorrectly: llmOk, counted: present && llmOk, note: usage?.note ?? "" };
  });
  const scored = toScored(errors);
  const gai = computeGai(task.text, scored);
  const lri = computeLri({
    text: task.text,
    errors: scored,
    chunksRequired: Math.min(task.chunkRequirement ?? task.requiredChunks.length, task.requiredChunks.length),
    chunksUsedCorrectly: Math.min(chunks.filter((c) => c.counted).length, task.chunkRequirement ?? task.requiredChunks.length),
  });
  return {
    errors,
    droppedSpans: spans.dropped.length,
    gai,
    lri,
    chunks,
    gate: repairGate(scored),
    offPrompt: evidence.offPrompt,
    nativeUpgrade: evidence.nativeUpgrade,
    verdictEn: evidence.verdictEn,
    verdictVi: evidence.verdictVi,
  };
}

export interface ComprehensionTask {
  question: string;
  rubric: string[];
  answer: string;
  sourceText: string;
}

export interface ComprehensionEvaluation {
  criteriaMet: number;
  criteriaTotal: number;
  rubric: ComprehensionEvidence["rubric"];
  misreadSource: boolean;
  criticalLogicError: boolean;
  errors: EvidenceError[];
  verdictEn: string;
  verdictVi: string;
}

export async function evaluateComprehension(task: ComprehensionTask, client?: LlmClient): Promise<ComprehensionEvaluation> {
  const user = `Judge a reading-comprehension answer against a fixed rubric. Mark a criterion "met" ONLY if the answer clearly satisfies it in the learner's own words. Vague, partially correct or merely copied wording is NOT met.

SOURCE TEXT:
${task.sourceText.slice(0, 7000)}

QUESTION: ${task.question}

RUBRIC CRITERIA (evaluate each, in this exact order and wording):
${task.rubric.map((r, i) => `${i + 1}. ${r}`).join("\n")}

LEARNER ANSWER (character offsets start at 0):
<<<${task.answer}>>>

Also list language errors in the answer and any LOGIC_COMPREHENSION error (misreading the source = CRITICAL).
${ERROR_TAXONOMY}

OUTPUT SCHEMA:
{"rubric":[{"criterion": string (copied from the list), "met": boolean, "evidence": string}], "misreadSource": boolean, "errors":[...same error object as described...], "verdictEn": string, "verdictVi": string}
Error object: {"original","start","end","correction","category","subtype","severity","ruleEn","ruleVi"}
${JSON_ONLY}`;
  let spans: ReturnType<typeof repairSpans> | null = null;
  const ev = await generateStructured({
    schema: ComprehensionEvidenceSchema,
    system: EDITOR_PERSONA,
    user,
    tier: "thorough",
    client,
    validate: (v) => {
      if (v.rubric.length !== task.rubric.length) return `rubric must have exactly ${task.rubric.length} entries in the given order.`;
      const praise = findBannedPraise(v.verdictEn);
      if (praise) return `Banned praise phrase "${praise}" found.`;
      spans = repairSpans(task.answer, v.errors);
      return null;
    },
  });
  const repaired = spans ?? repairSpans(task.answer, ev.errors);
  const criticalLogic = ev.misreadSource || repaired.errors.some((e) => e.category === "LOGIC_COMPREHENSION" && e.severity === "CRITICAL");
  return {
    criteriaMet: ev.rubric.filter((r) => r.met).length,
    criteriaTotal: task.rubric.length,
    rubric: ev.rubric,
    misreadSource: ev.misreadSource,
    criticalLogicError: criticalLogic,
    errors: repaired.errors,
    verdictEn: ev.verdictEn,
    verdictVi: ev.verdictVi,
  };
}

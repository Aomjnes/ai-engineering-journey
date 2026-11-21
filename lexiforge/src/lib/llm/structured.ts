import type { z } from "zod";
import { getLlmClient, LlmRequestError, type Effort, type LlmClient } from "./client";

export class StructuredOutputError extends Error {
  readonly code = "LLM_MALFORMED_OUTPUT";
  constructor(message: string, readonly attempts: number) {
    super(message);
  }
}

/** Extracts the first top-level JSON object/array from model text (tolerates code fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const firstObj = candidate.indexOf("{");
    const firstArr = candidate.indexOf("[");
    const starts = [firstObj, firstArr].filter((i) => i >= 0);
    if (starts.length === 0) throw new Error("No JSON found in model output.");
    const start = Math.min(...starts);
    const closer = candidate[start] === "{" ? "}" : "]";
    const end = candidate.lastIndexOf(closer);
    if (end <= start) throw new Error("Unterminated JSON in model output.");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

export interface StructuredRequest<S extends z.ZodTypeAny> {
  schema: S;
  system: string;
  user: string;
  effort?: Effort;
  maxTokens?: number;
  maxAttempts?: number;
  /** Extra semantic validation beyond the schema; return an error message to force a retry. */
  validate?: (value: z.infer<S>) => string | null;
  client?: LlmClient;
}

/**
 * Calls the LLM, parses JSON, validates with Zod (+ optional semantic check) and retries with the exact
 * validation errors fed back to the model. Never returns unvalidated data.
 */
export async function generateStructured<S extends z.ZodTypeAny>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  const client = req.client ?? getLlmClient();
  const maxAttempts = req.maxAttempts ?? 3;
  let feedback = "";
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: string;
    try {
      raw = await client.complete({
        system: req.system,
        user: feedback ? `${req.user}\n\n---\nYOUR PREVIOUS OUTPUT WAS REJECTED:\n${feedback}\nReturn ONLY the corrected JSON object.` : req.user,
        effort: req.effort,
        maxTokens: req.maxTokens,
      });
    } catch (error) {
      if (error instanceof LlmRequestError && error.retryable && attempt < maxAttempts) {
        lastError = error.message;
        continue;
      }
      throw error;
    }
    let json: unknown;
    try {
      json = extractJson(raw);
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Invalid JSON";
      feedback = `Invalid JSON: ${lastError}`;
      continue;
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) {
      lastError = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
      feedback = `Schema validation failed:\n${lastError}`;
      continue;
    }
    const semantic = req.validate?.(parsed.data) ?? null;
    if (semantic) {
      lastError = semantic;
      feedback = semantic;
      continue;
    }
    return parsed.data;
  }
  throw new StructuredOutputError(`LLM output failed validation after ${maxAttempts} attempts: ${lastError}`, maxAttempts);
}

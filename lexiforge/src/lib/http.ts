import { NextResponse } from "next/server";
import { z } from "zod";
import { LlmNotConfiguredError, LlmRequestError } from "@/lib/llm/client";
import { StructuredOutputError } from "@/lib/llm/structured";
import { CalibrationRequiredError } from "@/lib/profile/service";

/** Domain error with an HTTP status; thrown by services, rendered by `handle()`. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_FAILED", "Request body failed validation.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return parsed.data;
}

/** Wraps a route handler: maps known errors to typed JSON responses, never leaks stack traces. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) return jsonError(error.status, error.code, error.message, error.details);
    if (error instanceof CalibrationRequiredError) return jsonError(409, error.code, error.message);
    if (error instanceof LlmNotConfiguredError) return jsonError(503, error.code, error.message);
    if (error instanceof StructuredOutputError) return jsonError(502, error.code, "The language model returned malformed evidence repeatedly. Nothing was graded; submit again.");
    if (error instanceof LlmRequestError) {
      if (error.code === "LLM_RATE_LIMIT") {
        const retryAfterSeconds = Math.max(1, error.retryAfterSeconds ?? 60);
        const res = jsonError(429, error.code, error.message, { retryAfterSeconds });
        res.headers.set("Retry-After", String(retryAfterSeconds));
        return res;
      }
      return jsonError(502, error.code, error.message);
    }
    if (error instanceof z.ZodError) {
      console.error("[api] stored data failed validation", error.issues);
      return jsonError(500, "DATA_CORRUPT", "Stored data failed validation. Nothing was changed.");
    }
    console.error("[api] unhandled error", error);
    return jsonError(500, "INTERNAL", "Unexpected server error.");
  }
}

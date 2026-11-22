import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from "@google/genai";
import type { LlmProviderName } from "@/lib/env";

/**
 * Per-task reasoning profile.
 * - minimal: latency-critical display tasks (4-mode explainer). Thinking off / lowest supported level.
 * - standard: content generation (lesson synthesis, question sets).
 * - thorough: anything that produces graded evidence (evaluate, diagnostic, promotion audit). Never lowered.
 */
export type ThinkingTier = "minimal" | "standard" | "thorough";

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
  tier?: ThinkingTier;
  /** Honoured only where the provider/model accepts sampling parameters (Gemini). */
  temperature?: number;
}

const ANTHROPIC_EFFORT: Record<ThinkingTier, "low" | "medium" | "high"> = { minimal: "low", standard: "medium", thorough: "high" };
const OPENAI_EFFORT: Record<ThinkingTier, "minimal" | "medium" | "high"> = { minimal: "minimal", standard: "medium", thorough: "high" };

/**
 * Gemini thinking configuration for a tier. Gemini 3+ models take `thinkingLevel`; 2.5 models take a token
 * `thinkingBudget` (Flash can switch thinking off with 0; Pro's minimum is 128).
 */
export function geminiThinkingConfig(model: string, tier: ThinkingTier): ThinkingConfig {
  const m = model.toLowerCase();
  if (/gemini-2\.5/.test(m)) {
    const pro = m.includes("pro");
    const budget = tier === "minimal" ? (pro ? 128 : 0) : tier === "standard" ? 2048 : -1; // -1 = dynamic (model decides, full depth)
    return { thinkingBudget: budget, includeThoughts: false };
  }
  const level = tier === "minimal" ? ThinkingLevel.MINIMAL : tier === "standard" ? ThinkingLevel.LOW : ThinkingLevel.HIGH;
  return { thinkingLevel: level, includeThoughts: false };
}

/** Minimal provider-agnostic surface. Implementations must return the raw text of the reply. */
export interface LlmClient {
  readonly provider: LlmProviderName | "test";
  readonly model: string;
  complete(req: CompletionRequest): Promise<string>;
}

export class LlmNotConfiguredError extends Error {
  readonly code = "LLM_NOT_CONFIGURED";
  constructor() {
    super("No LLM API key configured. Set GEMINI_API_KEY(S), GROQ_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY and restart the server.");
  }
}

export class LlmRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  /** HTTP status from the provider when known (429 / 503 trigger the router's cooldown). */
  readonly status: number | undefined;
  /** Provider-suggested wait (Retry-After header or Gemini retryDelay). */
  readonly retryAfterSeconds: number | undefined;
  constructor(message: string, code: string, retryable: boolean, opts: { status?: number; retryAfterSeconds?: number } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.status = opts.status;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

/** Parses Retry-After (seconds or HTTP date) or a Gemini `retryDelay: "37s"` hint. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const delay = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/i.exec(value);
  if (delay) return Math.ceil(Number(delay[1]));
  if (/^\s*\d+(\.\d+)?\s*$/.test(value)) return Math.ceil(Number(value));
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - now) / 1000));
  return undefined;
}

const headerOf = (error: unknown, name: string): string | null => {
  const h = (error as { headers?: unknown }).headers;
  if (h && typeof (h as Headers).get === "function") return (h as Headers).get(name);
  if (h && typeof h === "object") return ((h as Record<string, string | undefined>)[name] ?? null) as string | null;
  return null;
};

// Models that accept Anthropic's server-side refusal fallback ("default" routing).
const FALLBACK_CAPABLE = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-fable-5-2"]);

export class AnthropicLlm implements LlmClient {
  readonly provider = "anthropic" as const;
  private readonly client: Anthropic;
  constructor(apiKey: string, readonly model: string) {
    // The router handles fallback; SDK retries would only hammer a rate-limited endpoint.
    this.client = new Anthropic({ apiKey, maxRetries: 1 });
  }
  async complete({ system, user, maxTokens = 16000, tier = "standard" }: CompletionRequest): Promise<string> {
    const effort = ANTHROPIC_EFFORT[tier];
    try {
      const useFallback = FALLBACK_CAPABLE.has(this.model);
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system,
        thinking: { type: "adaptive" },
        output_config: { effort },
        messages: [{ role: "user", content: user }],
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      if (response.stop_reason === "refusal") throw new LlmRequestError("The model declined this request.", "LLM_REFUSAL", false);
      if (response.stop_reason === "max_tokens") throw new LlmRequestError("The model reply was truncated (max_tokens).", "LLM_TRUNCATED", true);
      return response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    } catch (error) {
      if (error instanceof LlmRequestError) throw error;
      if (error instanceof Anthropic.AuthenticationError) throw new LlmRequestError("Anthropic rejected the API key.", "LLM_AUTH", false);
      if (error instanceof Anthropic.RateLimitError) throw new LlmRequestError("Anthropic rate limit reached. Try again shortly.", "LLM_RATE_LIMIT", true, { status: 429, retryAfterSeconds: parseRetryAfter(headerOf(error, "retry-after")) });
      if (error instanceof Anthropic.BadRequestError) throw new LlmRequestError(`Anthropic rejected the request: ${error.message}`, "LLM_BAD_REQUEST", false);
      if (error instanceof Anthropic.APIError) throw new LlmRequestError(`Anthropic API error ${error.status ?? ""}: ${error.message}`, "LLM_UPSTREAM", true, { status: error.status, retryAfterSeconds: parseRetryAfter(headerOf(error, "retry-after")) });
      throw error;
    }
  }
}

export class OpenAiLlm implements LlmClient {
  readonly provider = "openai" as const;
  private readonly client: OpenAI;
  constructor(apiKey: string, readonly model: string) {
    this.client = new OpenAI({ apiKey, maxRetries: 1 });
  }
  async complete({ system, user, maxTokens = 16000, tier = "standard" }: CompletionRequest): Promise<string> {
    try {
      const reasoning = /^(gpt-5|o\d)/.test(this.model) ? { reasoning: { effort: OPENAI_EFFORT[tier] } } : {};
      const response = await this.client.responses.create({
        model: this.model,
        instructions: system,
        input: user,
        max_output_tokens: maxTokens,
        ...reasoning,
      });
      return response.output_text;
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) throw new LlmRequestError("OpenAI rejected the API key.", "LLM_AUTH", false);
      if (error instanceof OpenAI.RateLimitError) throw new LlmRequestError("OpenAI rate limit reached. Try again shortly.", "LLM_RATE_LIMIT", true, { status: 429, retryAfterSeconds: parseRetryAfter(headerOf(error, "retry-after")) });
      if (error instanceof OpenAI.APIError) throw new LlmRequestError(`OpenAI API error ${error.status ?? ""}: ${error.message}`, "LLM_UPSTREAM", true, { status: error.status, retryAfterSeconds: parseRetryAfter(headerOf(error, "retry-after")) });
      throw error;
    }
  }
}

export class GeminiLlm implements LlmClient {
  readonly provider = "gemini" as const;
  private readonly client: GoogleGenAI;
  constructor(apiKey: string, readonly model: string) {
    this.client = new GoogleGenAI({ apiKey });
  }
  async complete({ system, user, maxTokens = 16000, tier = "standard", temperature }: CompletionRequest): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          maxOutputTokens: maxTokens,
          thinkingConfig: geminiThinkingConfig(this.model, tier),
          ...(temperature === undefined ? {} : { temperature }),
        },
      });
      const finish = response.candidates?.[0]?.finishReason;
      if (finish === "MAX_TOKENS") throw new LlmRequestError("Gemini reply was truncated (max tokens).", "LLM_TRUNCATED", true);
      return response.text ?? "";
    } catch (error) {
      if (error instanceof LlmRequestError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const statusField = (error as { status?: unknown }).status;
      const statusInText = /\b(429|500|502|503|504|404)\b/.exec(message)?.[1];
      const status = typeof statusField === "number" ? statusField : statusInText ? Number(statusInText) : undefined;
      const rate = status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message);
      throw new LlmRequestError(`Gemini API error: ${message}`, rate ? "LLM_RATE_LIMIT" : status === 404 ? "LLM_MODEL_UNAVAILABLE" : "LLM_UPSTREAM", status !== 404, {
        status: rate ? 429 : status,
        retryAfterSeconds: parseRetryAfter(message),
      });
    }
  }
}

/** Groq (free tier) through its OpenAI-compatible Chat Completions endpoint with JSON mode. */
export class GroqLlm implements LlmClient {
  readonly provider = "groq" as const;
  constructor(private readonly apiKey: string, readonly model: string, private readonly fetchImpl: typeof fetch = (...a) => fetch(...a)) {}
  async complete({ system, user, maxTokens = 8000, temperature }: CompletionRequest): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: `${system}\nRespond with a single JSON object.` },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          max_tokens: Math.min(maxTokens, 8000),
          temperature: temperature ?? 0.3,
        }),
      });
    } catch (error) {
      throw new LlmRequestError(`Groq network error: ${error instanceof Error ? error.message : String(error)}`, "LLM_UPSTREAM", true);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const retryAfterSeconds = parseRetryAfter(res.headers.get("retry-after"));
      if (res.status === 429) throw new LlmRequestError("Groq rate limit reached.", "LLM_RATE_LIMIT", true, { status: 429, retryAfterSeconds });
      if (res.status === 401 || res.status === 403) throw new LlmRequestError("Groq rejected the API key.", "LLM_AUTH", false, { status: res.status });
      if (res.status === 404) throw new LlmRequestError(`Groq model not available: ${this.model}`, "LLM_MODEL_UNAVAILABLE", false, { status: 404 });
      throw new LlmRequestError(`Groq API error ${res.status}: ${body.slice(0, 300)}`, "LLM_UPSTREAM", true, { status: res.status, retryAfterSeconds });
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") throw new LlmRequestError("Groq reply was truncated (max tokens).", "LLM_TRUNCATED", true);
    return choice?.message?.content ?? "";
  }
}

let override: LlmClient | null = null;

/** Test seam: inject a deterministic client (used by vitest). Pass null to restore auto-detection. */
export function setLlmClientForTesting(client: LlmClient | null): void {
  override = client;
}

export function getOverrideClient(): LlmClient | null {
  return override;
}

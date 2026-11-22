import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from "@google/genai";
import { detectProvider, type LlmProviderName } from "@/lib/env";

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
    super("No LLM API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY in .env and restart the server.");
  }
}

export class LlmRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

// Models that accept Anthropic's server-side refusal fallback ("default" routing).
const FALLBACK_CAPABLE = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-fable-5-2"]);

class AnthropicLlm implements LlmClient {
  readonly provider = "anthropic" as const;
  private readonly client: Anthropic;
  constructor(apiKey: string, readonly model: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 3 });
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
      if (error instanceof Anthropic.RateLimitError) throw new LlmRequestError("Anthropic rate limit reached. Try again shortly.", "LLM_RATE_LIMIT", true);
      if (error instanceof Anthropic.BadRequestError) throw new LlmRequestError(`Anthropic rejected the request: ${error.message}`, "LLM_BAD_REQUEST", false);
      if (error instanceof Anthropic.APIError) throw new LlmRequestError(`Anthropic API error ${error.status ?? ""}: ${error.message}`, "LLM_UPSTREAM", true);
      throw error;
    }
  }
}

class OpenAiLlm implements LlmClient {
  readonly provider = "openai" as const;
  private readonly client: OpenAI;
  constructor(apiKey: string, readonly model: string) {
    this.client = new OpenAI({ apiKey, maxRetries: 3 });
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
      if (error instanceof OpenAI.RateLimitError) throw new LlmRequestError("OpenAI rate limit reached. Try again shortly.", "LLM_RATE_LIMIT", true);
      if (error instanceof OpenAI.APIError) throw new LlmRequestError(`OpenAI API error ${error.status ?? ""}: ${error.message}`, "LLM_UPSTREAM", true);
      throw error;
    }
  }
}

class GeminiLlm implements LlmClient {
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
      const rate = /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(message);
      throw new LlmRequestError(`Gemini API error: ${message}`, rate ? "LLM_RATE_LIMIT" : "LLM_UPSTREAM", !rate);
    }
  }
}

let override: LlmClient | null = null;

/** Test seam: inject a deterministic client (used by vitest). Pass null to restore auto-detection. */
export function setLlmClientForTesting(client: LlmClient | null): void {
  override = client;
}

export function isLlmConfigured(): boolean {
  return override !== null || detectProvider() !== null;
}

export function getLlmClient(): LlmClient {
  if (override) return override;
  const detected = detectProvider();
  if (!detected) throw new LlmNotConfiguredError();
  switch (detected.provider) {
    case "anthropic":
      return new AnthropicLlm(detected.apiKey, detected.model);
    case "openai":
      return new OpenAiLlm(detected.apiKey, detected.model);
    case "gemini":
      return new GeminiLlm(detected.apiKey, detected.model);
  }
}

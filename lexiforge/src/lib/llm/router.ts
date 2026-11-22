/**
 * Free-tier resilient LLM router.
 *
 * Candidate chain (in order): Anthropic → OpenAI (if keys exist) → Gemini model waterfall × key rotation
 * (GEMINI_MODEL then GEMINI_FALLBACK_MODELS; within a model every key in GEMINI_API_KEYS) → Groq.
 * A candidate that answers 429/503 is put in cooldown (Retry-After, else 60 s) and the SAME request moves to the
 * next healthy candidate immediately. A model that does not exist (404) is parked for an hour. Only when every
 * candidate is cooling down does the caller get LLM_RATE_LIMIT, with the exact seconds until the first one recovers.
 * A small semaphore caps concurrent LLM calls per instance (LLM_MAX_CONCURRENCY, default 2).
 */
import { geminiKeys, geminiModels, getEnv, type Env, type LlmProviderName } from "@/lib/env";
import { AnthropicLlm, GeminiLlm, getOverrideClient, GroqLlm, LlmNotConfiguredError, LlmRequestError, OpenAiLlm, type CompletionRequest, type LlmClient } from "./client";

export const DEFAULT_COOLDOWN_SECONDS = 60;
export const UNAVAILABLE_COOLDOWN_SECONDS = 3600;
const MAX_COOLDOWN_SECONDS = 3600;

export interface Candidate {
  /** Stable id: provider:model:key#n (never contains the key itself). */
  id: string;
  provider: LlmProviderName | "test";
  model: string;
  keyLabel: string;
  create: () => LlmClient;
}

// ───────────────────────────── Cooldown map (per server instance) ─────────────────────────────

const cooldownUntil = new Map<string, { until: number; reason: string }>();
let clock: () => number = () => Date.now();

/** Test seam: freeze/advance time and clear cooldowns. */
export function setRouterClockForTesting(fn: (() => number) | null): void {
  clock = fn ?? (() => Date.now());
}
export function resetRouterState(): void {
  cooldownUntil.clear();
  active = 0;
  waiters.splice(0);
}

export function markCooldown(id: string, seconds: number, reason: string): void {
  const s = Math.min(MAX_COOLDOWN_SECONDS, Math.max(1, Math.ceil(seconds)));
  cooldownUntil.set(id, { until: clock() + s * 1000, reason });
}

/** Remaining cooldown in seconds (0 = healthy). */
export function cooldownRemaining(id: string): number {
  const c = cooldownUntil.get(id);
  if (!c) return 0;
  const ms = c.until - clock();
  if (ms <= 0) {
    cooldownUntil.delete(id);
    return 0;
  }
  return Math.ceil(ms / 1000);
}

// ───────────────────────────── Concurrency limiter ─────────────────────────────

let active = 0;
const waiters: Array<() => void> = [];

async function withSlot<T>(limit: number, fn: () => Promise<T>): Promise<T> {
  if (active >= limit) await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

/** Number of in-flight LLM calls on this instance (for tests and the settings page). */
export function activeLlmCalls(): number {
  return active;
}

// ───────────────────────────── Candidates from env ─────────────────────────────

export function buildCandidates(env: Env = getEnv()): Candidate[] {
  const out: Candidate[] = [];
  if (env.ANTHROPIC_API_KEY) {
    const key = env.ANTHROPIC_API_KEY;
    out.push({ id: `anthropic:${env.ANTHROPIC_MODEL}:key#1`, provider: "anthropic", model: env.ANTHROPIC_MODEL, keyLabel: "ANTHROPIC_API_KEY", create: () => new AnthropicLlm(key, env.ANTHROPIC_MODEL) });
  }
  if (env.OPENAI_API_KEY) {
    const key = env.OPENAI_API_KEY;
    out.push({ id: `openai:${env.OPENAI_MODEL}:key#1`, provider: "openai", model: env.OPENAI_MODEL, keyLabel: "OPENAI_API_KEY", create: () => new OpenAiLlm(key, env.OPENAI_MODEL) });
  }
  const keys = geminiKeys(env);
  for (const model of geminiModels(env)) {
    keys.forEach((key, i) => {
      out.push({ id: `gemini:${model}:key#${i + 1}`, provider: "gemini", model, keyLabel: `Gemini key #${i + 1}`, create: () => new GeminiLlm(key, model) });
    });
  }
  if (env.GROQ_API_KEY) {
    const key = env.GROQ_API_KEY;
    out.push({ id: `groq:${env.GROQ_MODEL}:key#1`, provider: "groq", model: env.GROQ_MODEL, keyLabel: "GROQ_API_KEY", create: () => new GroqLlm(key, env.GROQ_MODEL) });
  }
  return out;
}

const isOverload = (e: LlmRequestError) => e.code === "LLM_RATE_LIMIT" || e.status === 429 || e.status === 503 || e.status === 529;

/** Error returned when every candidate is cooling down; carries the exact wait for a UI countdown. */
export class AllProvidersExhaustedError extends LlmRequestError {
  constructor(readonly retryAfterSecondsExact: number) {
    super(`All AI providers are rate-limited. Try again in ${retryAfterSecondsExact} s.`, "LLM_RATE_LIMIT", false, { status: 429, retryAfterSeconds: retryAfterSecondsExact });
  }
}

export class RouterLlm implements LlmClient {
  private last: Candidate | undefined;
  constructor(private readonly candidates: Candidate[], private readonly maxConcurrency = 2) {
    if (candidates.length === 0) throw new LlmNotConfiguredError();
  }
  get provider(): LlmProviderName | "test" {
    return (this.last ?? this.candidates[0])?.provider ?? "test";
  }
  get model(): string {
    return (this.last ?? this.candidates[0])?.model ?? "";
  }
  /** Which candidate served the last successful call (for caches and logs). */
  get lastCandidateId(): string | undefined {
    return this.last?.id;
  }

  complete(req: CompletionRequest): Promise<string> {
    return withSlot(this.maxConcurrency, () => this.route(req));
  }

  private async route(req: CompletionRequest): Promise<string> {
    let lastError: LlmRequestError | null = null;
    for (const c of this.candidates) {
      if (cooldownRemaining(c.id) > 0) continue;
      try {
        const text = await c.create().complete(req);
        this.last = c;
        return text;
      } catch (error) {
        if (!(error instanceof LlmRequestError)) throw error;
        if (isOverload(error)) {
          markCooldown(c.id, error.retryAfterSeconds ?? DEFAULT_COOLDOWN_SECONDS, error.code);
          lastError = error;
          continue;
        }
        if (error.code === "LLM_MODEL_UNAVAILABLE" || error.code === "LLM_AUTH") {
          markCooldown(c.id, UNAVAILABLE_COOLDOWN_SECONDS, error.code);
          lastError = error;
          continue;
        }
        if (error.retryable && error.code === "LLM_UPSTREAM") {
          // Transient 5xx: try the next candidate for this request, without parking this one.
          lastError = error;
          continue;
        }
        throw error; // refusal, truncation, bad request: the request itself is the problem
      }
    }
    const waits = this.candidates.map((c) => cooldownRemaining(c.id)).filter((s) => s > 0);
    if (waits.length === this.candidates.length) throw new AllProvidersExhaustedError(Math.min(...waits));
    throw lastError ?? new AllProvidersExhaustedError(DEFAULT_COOLDOWN_SECONDS);
  }
}

// ───────────────────────────── Public API ─────────────────────────────

export function isLlmConfigured(): boolean {
  return getOverrideClient() !== null || buildCandidates().length > 0;
}

/** The app-wide client: the test override, otherwise the resilient router over every configured provider. */
export function getLlmClient(): LlmClient {
  const o = getOverrideClient();
  if (o) return o;
  const env = getEnv();
  return new RouterLlm(buildCandidates(env), env.LLM_MAX_CONCURRENCY);
}

export interface ProviderHealth {
  id: string;
  provider: string;
  model: string;
  keyLabel: string;
  order: number;
  cooldownSeconds: number;
  reason: string | null;
}

/** Fallback order and live cooldowns (this instance) for the settings page. Never exposes keys. */
export function providerHealth(env: Env = getEnv()): ProviderHealth[] {
  return buildCandidates(env).map((c, i) => {
    const s = cooldownRemaining(c.id);
    return { id: c.id, provider: c.provider, model: c.model, keyLabel: c.keyLabel, order: i + 1, cooldownSeconds: s, reason: s > 0 ? (cooldownUntil.get(c.id)?.reason ?? null) : null };
  });
}

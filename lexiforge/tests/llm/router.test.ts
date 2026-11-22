import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GroqLlm, LlmRequestError, parseRetryAfter, type CompletionRequest, type LlmClient } from "@/lib/llm/client";
import { activeLlmCalls, AllProvidersExhaustedError, buildCandidates, cooldownRemaining, resetRouterState, RouterLlm, setRouterClockForTesting, type Candidate } from "@/lib/llm/router";
import type { Env } from "@/lib/env";

let now = 1_000_000;
const REQ: CompletionRequest = { system: "s", user: "Return JSON." };

/** A fake endpoint: answers from a script of outcomes ("ok" | 429 | 503 | 404 | 500) and counts calls. */
function endpoint(id: string, script: Array<"ok" | 429 | 503 | 404 | 500>, retryAfter?: number) {
  const calls = { n: 0 };
  const cand: Candidate = {
    id,
    provider: id.startsWith("groq") ? "groq" : "gemini",
    model: id.split(":")[1] ?? "m",
    keyLabel: id,
    create: (): LlmClient => ({
      provider: "gemini",
      model: "m",
      complete: async () => {
        const step = script[Math.min(calls.n, script.length - 1)];
        calls.n++;
        if (step === "ok") return `{"from":"${id}"}`;
        if (step === 429) throw new LlmRequestError("rate", "LLM_RATE_LIMIT", true, { status: 429, retryAfterSeconds: retryAfter });
        if (step === 503) throw new LlmRequestError("overloaded", "LLM_UPSTREAM", true, { status: 503 });
        if (step === 404) throw new LlmRequestError("no model", "LLM_MODEL_UNAVAILABLE", false, { status: 404 });
        throw new LlmRequestError("boom", "LLM_UPSTREAM", true, { status: 500 });
      },
    }),
  };
  return { cand, calls };
}

describe("free-tier LLM router", () => {
  beforeEach(() => {
    now = 1_000_000;
    resetRouterState();
    setRouterClockForTesting(() => now);
  });
  afterEach(() => setRouterClockForTesting(null));

  it("rotates to the next Gemini key on 429 and parks the limited key", async () => {
    const k1 = endpoint("gemini:flash:key#1", [429]);
    const k2 = endpoint("gemini:flash:key#2", ["ok"]);
    const r = new RouterLlm([k1.cand, k2.cand]);
    expect(await r.complete(REQ)).toContain("key#2");
    expect(r.lastCandidateId).toBe("gemini:flash:key#2");
    expect(cooldownRemaining("gemini:flash:key#1")).toBe(60);
    // While cooling down, the limited key is NOT called again (no hammering).
    await r.complete(REQ);
    await r.complete(REQ);
    expect(k1.calls.n).toBe(1);
    expect(k2.calls.n).toBe(3);
  });

  it("falls through the Gemini model waterfall, then to Groq", async () => {
    const primary = endpoint("gemini:2.5-flash:key#1", [429]);
    const lite = endpoint("gemini:2.5-flash-lite:key#1", [503]);
    const old = endpoint("gemini:2.0-flash:key#1", [404]);
    const groq = endpoint("groq:llama:key#1", ["ok"]);
    const r = new RouterLlm([primary.cand, lite.cand, old.cand, groq.cand]);
    expect(await r.complete(REQ)).toContain("groq");
    expect(r.provider).toBe("groq");
    expect(cooldownRemaining(lite.cand.id)).toBe(60); // 503 also cools down
    expect(cooldownRemaining(old.cand.id)).toBe(3600); // missing model parked for an hour
  });

  it("respects Retry-After and recovers after the cooldown", async () => {
    const a = endpoint("gemini:flash:key#1", [429, "ok"], 17);
    const b = endpoint("groq:llama:key#1", ["ok"]);
    const r = new RouterLlm([a.cand, b.cand]);
    await r.complete(REQ);
    expect(cooldownRemaining(a.cand.id)).toBe(17);
    now += 16_000;
    await r.complete(REQ);
    expect(a.calls.n).toBe(1); // still cooling
    now += 2_000;
    expect(await r.complete(REQ)).toContain("gemini:flash:key#1"); // healthy again, primary preferred
    expect(a.calls.n).toBe(2);
  });

  it("only when every candidate is exhausted returns LLM_RATE_LIMIT with the exact wait", async () => {
    const a = endpoint("gemini:flash:key#1", [429], 40);
    const b = endpoint("groq:llama:key#1", [429], 25);
    const r = new RouterLlm([a.cand, b.cand]);
    const e1 = await r.complete(REQ).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(AllProvidersExhaustedError);
    expect((e1 as AllProvidersExhaustedError).retryAfterSeconds).toBe(25);
    expect((e1 as LlmRequestError).retryable).toBe(false);
    now += 5_000;
    const e2 = await r.complete(REQ).catch((e: unknown) => e);
    expect((e2 as LlmRequestError).retryAfterSeconds).toBe(20);
    expect(a.calls.n + b.calls.n).toBe(2); // the second request made zero upstream calls
  });

  it("transient 5xx moves on for this request without parking the endpoint; request errors are not retried elsewhere", async () => {
    const a = endpoint("gemini:flash:key#1", [500, "ok"]);
    const b = endpoint("groq:llama:key#1", ["ok"]);
    const r = new RouterLlm([a.cand, b.cand]);
    expect(await r.complete(REQ)).toContain("groq");
    expect(cooldownRemaining(a.cand.id)).toBe(0);
    const refusing: Candidate = { ...a.cand, id: "x", create: () => ({ provider: "gemini", model: "m", complete: async () => { throw new LlmRequestError("declined", "LLM_REFUSAL", false); } }) };
    await expect(new RouterLlm([refusing, b.cand]).complete(REQ)).rejects.toMatchObject({ code: "LLM_REFUSAL" });
  });

  it("caps concurrent upstream calls", async () => {
    let peak = 0;
    let inflight = 0;
    const slow: Candidate = {
      id: "gemini:slow:key#1",
      provider: "gemini",
      model: "slow",
      keyLabel: "k",
      create: () => ({
        provider: "gemini",
        model: "slow",
        complete: async () => {
          inflight++;
          peak = Math.max(peak, inflight, activeLlmCalls());
          await new Promise((r) => setTimeout(r, 15));
          inflight--;
          return "{}";
        },
      }),
    };
    const r = new RouterLlm([slow], 2);
    await Promise.all(Array.from({ length: 6 }, () => r.complete(REQ)));
    expect(peak).toBe(2);
  });

  it("builds the chain from env: keys × model waterfall, de-duplicated, Groq last, keys never in ids", () => {
    const env = {
      GEMINI_API_KEYS: "AIzaA, AIzaB ,AIzaA",
      GEMINI_API_KEY: "AIzaC",
      GEMINI_MODEL: "gemini-2.5-flash",
      GEMINI_FALLBACK_MODELS: "gemini-2.5-flash-lite,gemini-2.0-flash,gemini-2.5-flash",
      GROQ_API_KEY: "gsk_x",
      GROQ_MODEL: "llama-3.3-70b-versatile",
      ANTHROPIC_MODEL: "a",
      OPENAI_MODEL: "o",
      LLM_MAX_CONCURRENCY: 2,
    } as unknown as Env;
    const ids = buildCandidates(env).map((c) => c.id);
    expect(ids).toEqual([
      "gemini:gemini-2.5-flash:key#1", "gemini:gemini-2.5-flash:key#2", "gemini:gemini-2.5-flash:key#3",
      "gemini:gemini-2.5-flash-lite:key#1", "gemini:gemini-2.5-flash-lite:key#2", "gemini:gemini-2.5-flash-lite:key#3",
      "gemini:gemini-2.0-flash:key#1", "gemini:gemini-2.0-flash:key#2", "gemini:gemini-2.0-flash:key#3",
      "groq:llama-3.3-70b-versatile:key#1",
    ]);
    expect(ids.join(" ")).not.toMatch(/AIza|gsk_/);
  });

  it("Groq client: JSON mode request, 429 with Retry-After, and success", async () => {
    const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
    let first = true;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      if (first) {
        first = false;
        return new Response("slow down", { status: 429, headers: { "retry-after": "12" } });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const g = new GroqLlm("gsk_test", "llama-3.3-70b-versatile", fakeFetch);
    await expect(g.complete(REQ)).rejects.toMatchObject({ code: "LLM_RATE_LIMIT", status: 429, retryAfterSeconds: 12 });
    expect(await g.complete(REQ)).toBe('{"ok":true}');
    expect(seen[0]?.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(seen[0]?.body.response_format).toEqual({ type: "json_object" });
    expect(seen[0]?.body.model).toBe("llama-3.3-70b-versatile");
  });

  it("parses Retry-After seconds, HTTP dates and Gemini retryDelay hints", () => {
    expect(parseRetryAfter("30")).toBe(30);
    expect(parseRetryAfter(new Date(Date.UTC(2026, 0, 1, 0, 0, 45)).toUTCString(), Date.UTC(2026, 0, 1, 0, 0, 0))).toBe(45);
    expect(parseRetryAfter('{"error":{"code":429,"details":[{"retryDelay":"37s"}]}}')).toBe(37);
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

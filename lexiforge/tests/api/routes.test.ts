import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, handle } from "@/lib/http";
import { LlmNotConfiguredError, setLlmClientForTesting } from "@/lib/llm/client";
import { POST as evaluatePOST } from "@/app/api/evaluate/route";
import { POST as explainPOST } from "@/app/api/explain/route";
import { GET as cronGET } from "@/app/api/cron/ingest/route";
import { POST as ingestPOST } from "@/app/api/ingest/route";
import { GET as lessonsGET } from "@/app/api/lessons/route";
import { POST as diagnosticPOST } from "@/app/api/diagnostic/route";
import { resetDb } from "../helpers/db";

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("API hardening", () => {
  beforeEach(resetDb);
  afterAll(() => setLlmClientForTesting(null));

  it("maps domain, validation and configuration errors to typed JSON", async () => {
    const a = await handle(async () => {
      throw new AppError(418, "TEAPOT", "nope");
    });
    expect(a.status).toBe(418);
    expect(await a.json()).toEqual({ error: { code: "TEAPOT", message: "nope" } });
    const b = await handle(async () => {
      throw new LlmNotConfiguredError();
    });
    expect(b.status).toBe(503);
    const c = await handle(async () => {
      z.object({ a: z.string() }).parse({});
      return new Response();
    });
    expect((await c.json()).error.code).toBe("DATA_CORRUPT");
    const d = await handle(async () => {
      throw new Error("boom with secrets");
    });
    expect(await d.json()).toEqual({ error: { code: "INTERNAL", message: "Unexpected server error." } });
  });

  it("rejects malformed and invalid bodies with 400", async () => {
    expect((await evaluatePOST(post("/api/evaluate", "{not json"))).status).toBe(400);
    const r = await evaluatePOST(post("/api/evaluate", { stage: "PRODUCTION", lessonId: "" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe("VALIDATION_FAILED");
    expect((await diagnosticPOST(post("/api/diagnostic", { action: "hack" }))).status).toBe(400);
  });

  it("requires calibration before lessons or grading", async () => {
    const r = await evaluatePOST(post("/api/evaluate", { stage: "PRODUCTION", lessonId: "x", text: "hello" }));
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe("CALIBRATION_REQUIRED");
    expect((await lessonsGET()).status).toBe(409);
  });

  it("explains missing LLM keys instead of crashing", async () => {
    setLlmClientForTesting(null);
    const r = await explainPOST(post("/api/explain", { selection: "raise concerns", context: "Critics raise concerns." }));
    expect(r.status).toBe(503);
    expect((await r.json()).error.message).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("protects ingestion triggers", async () => {
    const noAuth = await cronGET(new Request("http://localhost:3000/api/cron/ingest"));
    expect(noAuth.status).toBe(401);
    const crossSite = await ingestPOST(post("/api/ingest", {}, { origin: "https://evil.example", host: "localhost:3000" }));
    expect(crossSite.status).toBe(403);
  });
});

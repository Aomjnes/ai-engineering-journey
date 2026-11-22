import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectProvider, geminiKeys, geminiModels, getEnv } from "@/lib/env";
import { activeLlmCalls, providerHealth } from "@/lib/llm/router";
import { handle } from "@/lib/http";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";

/** Read-only configuration status. Secrets are never returned — only whether they are set. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireStream(req);
    const env = getEnv();
    const llm = detectProvider(env);
    const feeds = await prisma.sourceFeed.findMany({ orderBy: { name: "asc" }, select: { name: true, url: true, status: true, lastFetchedAt: true, lastError: true, consecutiveFailures: true } });
    return NextResponse.json({
      llm: llm ? { provider: llm.provider, model: llm.model } : null,
      keys: { anthropic: !!env.ANTHROPIC_API_KEY, openai: !!env.OPENAI_API_KEY, gemini: geminiKeys(env).length > 0, groq: !!env.GROQ_API_KEY },
      quota: {
        geminiKeyCount: geminiKeys(env).length,
        geminiModels: geminiModels(env),
        groqModel: env.GROQ_API_KEY ? env.GROQ_MODEL : null,
        maxConcurrency: env.LLM_MAX_CONCURRENCY,
        inFlight: activeLlmCalls(),
        // Fallback order with live cooldowns of this server instance. Keys are never returned.
        chain: providerHealth(env),
      },
      cron: { secretConfigured: !!env.CRON_SECRET, internalScheduler: env.ENABLE_INTERNAL_CRON === "true" },
      feeds,
    });
  });
}

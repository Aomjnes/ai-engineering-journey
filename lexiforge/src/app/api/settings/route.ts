import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectProvider, getEnv } from "@/lib/env";
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
      keys: { anthropic: !!env.ANTHROPIC_API_KEY, openai: !!env.OPENAI_API_KEY, gemini: !!env.GEMINI_API_KEY },
      cron: { secretConfigured: !!env.CRON_SECRET, internalScheduler: env.ENABLE_INTERNAL_CRON === "true" },
      feeds,
    });
  });
}

import { NextResponse } from "next/server";
import { handle, jsonError } from "@/lib/http";
import { isSameOrigin } from "@/lib/ingest/auth";
import { runIngestion } from "@/lib/ingest/pipeline";
import { prisma } from "@/lib/db";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual "Sync Live Content Now" trigger (same-origin browser requests only). */
export async function POST(req: Request) {
  return handle(async () => {
    await requireStream(req);
    if (!isSameOrigin(req)) return jsonError(403, "FORBIDDEN", "Manual sync is only accepted from the app itself.");
    return NextResponse.json(await runIngestion());
  });
}

/** Feed health for the dashboard. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireStream(req);
    const feeds = await prisma.sourceFeed.findMany({
      orderBy: { name: "asc" },
      select: { name: true, status: true, lastFetchedAt: true, lastError: true, consecutiveFailures: true, _count: { select: { articles: true } } },
    });
    return NextResponse.json({ feeds });
  });
}

import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { handle, jsonError } from "@/lib/http";
import { isSameOrigin, verifyCronSecret } from "@/lib/ingest/auth";
import { runIngestion } from "@/lib/ingest/pipeline";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron: GET with "Authorization: Bearer $CRON_SECRET" (schedule in vercel.json). */
export async function GET(req: Request) {
  return handle(async () => {
    const auth = verifyCronSecret(req.headers.get("authorization"), getEnv().CRON_SECRET);
    if (auth === "unconfigured") return jsonError(503, "CRON_NOT_CONFIGURED", "Set CRON_SECRET (≥ 16 chars) to enable this endpoint.");
    if (auth === "denied") return jsonError(401, "UNAUTHORIZED", "Missing or invalid bearer token.");
    return NextResponse.json(await runIngestion());
  });
}

/** Manual sync: either the cron bearer token, or a signed-in stream from the app itself (same origin). */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = verifyCronSecret(req.headers.get("authorization"), getEnv().CRON_SECRET);
    if (auth !== "ok") {
      await requireStream(req);
      if (!isSameOrigin(req)) return jsonError(403, "FORBIDDEN", "Manual sync is only accepted from the app itself.");
    }
    return NextResponse.json(await runIngestion());
  });
}

import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { handle, jsonError } from "@/lib/http";
import { verifyCronSecret } from "@/lib/ingest/auth";
import { runIngestion } from "@/lib/ingest/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(req: Request) {
  return handle(async () => {
    const auth = verifyCronSecret(req.headers.get("authorization"), getEnv().CRON_SECRET);
    if (auth === "unconfigured") return jsonError(503, "CRON_NOT_CONFIGURED", "Set CRON_SECRET (≥ 16 chars) in .env to enable this endpoint.");
    if (auth === "denied") return jsonError(401, "UNAUTHORIZED", "Missing or invalid bearer token.");
    return NextResponse.json(await runIngestion());
  });
}

export const GET = run;
export const POST = run;

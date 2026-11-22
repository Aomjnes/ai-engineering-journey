import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { explainSelection } from "@/lib/explain/service";
import { requireStream } from "@/lib/auth/stream";
import { getProfile } from "@/lib/profile/service";
import { bandLabel, type SubBand } from "@/lib/metrics/scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ selection: z.string().trim().min(1).max(500), context: z.string().max(3000).default("") });

export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const { selection, context } = await parseBody(req, Body);
    const profile = await getProfile(stream.id);
    const level = profile ? bandLabel(profile.subBand as SubBand) : "B1.1";
    const r = await explainSelection(selection, context || selection, level);
    return NextResponse.json(r.explanation, {
      headers: { "X-Explain-Cache": r.cached ? "HIT" : "MISS", "Server-Timing": `explain;dur=${r.ms}`, "Cache-Control": "no-store" },
    });
  });
}

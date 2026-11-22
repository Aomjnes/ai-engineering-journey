import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { requireStream } from "@/lib/auth/stream";
import { initializeRoadmap, parseTarget } from "@/lib/roadmap/service";

export const dynamic = "force-dynamic";

const Body = z.object({ targetSubBand: z.string().min(2).max(10), dailyMinutes: z.number().int() });

/** Creates the goal + milestones from the stream's current level. Deterministic: zero LLM calls. */
export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const b = await parseBody(req, Body);
    return NextResponse.json(await initializeRoadmap(stream.id, { targetSubBand: parseTarget(b.targetSubBand), dailyMinutes: b.dailyMinutes }, new Date()));
  });
}

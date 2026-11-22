import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { requireStream } from "@/lib/auth/stream";
import { parseTarget, roadmapView, setGoal } from "@/lib/roadmap/service";
import { bandLabel } from "@/lib/metrics/scoring";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    return NextResponse.json(await roadmapView(stream.id, new Date()));
  });
}

const Body = z.object({ targetSubBand: z.string().optional(), dailyMinutes: z.number().int().optional() });

/** Change the goal or daily minutes at any time; history is untouched and the roadmap regenerates. */
export async function PUT(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const b = await parseBody(req, Body);
    const target = b.targetSubBand ? parseTarget(b.targetSubBand) : undefined;
    const now = new Date();
    await setGoal(stream.id, { targetSubBand: target, dailyMinutes: b.dailyMinutes, targetLabel: target ? bandLabel(target) : undefined }, now);
    return NextResponse.json(await roadmapView(stream.id, now));
  });
}

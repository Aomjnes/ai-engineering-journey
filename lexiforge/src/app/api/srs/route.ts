import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { dueCards, reviewCard } from "@/lib/srs/service";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    return NextResponse.json({ cards: await dueCards(stream.id, new Date()) });
  });
}

const Body = z.object({ cardId: z.string().min(1), typed: z.string().max(200), responseMs: z.number().int().min(0).max(3_600_000) });

export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const body = await parseBody(req, Body);
    return NextResponse.json(await reviewCard(stream.id, body.cardId, body.typed, body.responseMs, new Date()));
  });
}

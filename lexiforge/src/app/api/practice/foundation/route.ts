import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { requireStream } from "@/lib/auth/stream";
import { answerFoundation, foundationOverview, nextFoundationItem } from "@/lib/practice/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const deck = new URL(req.url).searchParams.get("deck");
    return NextResponse.json(deck ? await nextFoundationItem(stream.id, deck) : { decks: await foundationOverview(stream.id) });
  });
}

const Body = z.object({ deckId: z.string().min(1).max(40), key: z.string().min(1).max(40), typed: z.string().max(200), responseMs: z.number().int().min(0).max(3_600_000) });

export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const b = await parseBody(req, Body);
    return NextResponse.json(await answerFoundation(stream.id, b.deckId, b.key, b.typed, b.responseMs, new Date()));
  });
}

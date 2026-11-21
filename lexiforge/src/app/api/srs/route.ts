import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { dueCards, reviewCard } from "@/lib/srs/service";
import { getLocalUser } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await getLocalUser();
    return NextResponse.json({ cards: await dueCards(user.id, new Date()) });
  });
}

const Body = z.object({ cardId: z.string().min(1), typed: z.string().max(200), responseMs: z.number().int().min(0).max(3_600_000) });

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, Body);
    const user = await getLocalUser();
    return NextResponse.json(await reviewCard(user.id, body.cardId, body.typed, body.responseMs, new Date()));
  });
}

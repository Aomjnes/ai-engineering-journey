import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { requireStream } from "@/lib/auth/stream";
import { checkDictation, checkSentence, checkSpeaking, getSession, lockInDictation, practiceOverview, roleplayTurn, startSession } from "@/lib/practice/service";

export const dynamic = "force-dynamic";
// Sentence checks use the thorough evaluator (40–64 s measured); 300 s matches the other grading routes.
export const maxDuration = 300;

export async function GET(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const id = new URL(req.url).searchParams.get("session");
    return NextResponse.json(id ? await getSession(stream.id, id) : await practiceOverview(stream.id));
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), mode: z.enum(["DICTATION", "SPEAKING", "SENTENCE", "ROLEPLAY"]), scenarioId: z.string().max(40).optional() }),
  z.object({ action: z.literal("dictation.check"), sessionId: z.string().min(1), index: z.number().int().min(0).max(9), typed: z.string().max(400) }),
  z.object({ action: z.literal("dictation.lockin"), sessionId: z.string().min(1), index: z.number().int().min(0).max(9), typed: z.string().max(400) }),
  z.object({ action: z.literal("speaking.check"), sessionId: z.string().min(1), index: z.number().int().min(0).max(9), transcript: z.string().max(400) }),
  z.object({ action: z.literal("sentence.check"), sessionId: z.string().min(1), index: z.number().int().min(0).max(9), chips: z.array(z.string().max(30)).max(30).optional(), text: z.string().max(400).optional() }),
  z.object({ action: z.literal("roleplay.turn"), sessionId: z.string().min(1), text: z.string().max(1200) }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const body = await parseBody(req, Body);
    const now = new Date();
    switch (body.action) {
      case "start":
        return NextResponse.json(await startSession(stream.id, body.mode, body.scenarioId, now));
      case "dictation.check":
        return NextResponse.json(await checkDictation(stream.id, body.sessionId, body.index, body.typed, now));
      case "dictation.lockin":
        return NextResponse.json(await lockInDictation(stream.id, body.sessionId, body.index, body.typed, now));
      case "speaking.check":
        return NextResponse.json(await checkSpeaking(stream.id, body.sessionId, body.index, body.transcript, now));
      case "sentence.check":
        return NextResponse.json(await checkSentence(stream.id, body.sessionId, body.index, { chips: body.chips, text: body.text }, now));
      case "roleplay.turn":
        return NextResponse.json(await roleplayTurn(stream.id, body.sessionId, body.text, now));
    }
  });
}

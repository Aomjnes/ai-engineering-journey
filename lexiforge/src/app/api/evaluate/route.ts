import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { submitComprehension, submitExitTicket, submitProduction, submitRewrite, submitShadowing, withLessonLock } from "@/lib/lessons/flow";
import { requireProfile } from "@/lib/profile/service";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";
// Thorough grading measured 40–64 s on Gemini Flash; 60 s would cut real evaluations. Vercel Fluid Compute allows 300 s.
export const maxDuration = 300;

const Body = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("INPUT"), lessonId: z.string().min(1), transcript: z.string().max(2000) }),
  z.object({ stage: z.literal("COMPREHENSION"), lessonId: z.string().min(1), questionId: z.string().min(1), answer: z.string().max(3000) }),
  z.object({ stage: z.literal("PRODUCTION"), lessonId: z.string().min(1), text: z.string().max(6000) }),
  z.object({ stage: z.literal("REWRITE"), lessonId: z.string().min(1), text: z.string().max(6000) }),
  z.object({
    stage: z.literal("EXIT_TICKET"),
    lessonId: z.string().min(1),
    sentences: z.array(z.object({ chunkId: z.string().min(1), text: z.string().max(600) })).min(1).max(12),
  }),
]);

/** Strict Diagnostic Engine entry point for every lesson stage. */
export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const body = await parseBody(req, Body);
    await requireProfile(stream.id);
    const now = new Date();
    return withLessonLock(body.lessonId, async () => {
      switch (body.stage) {
        case "INPUT":
          return NextResponse.json(await submitShadowing(stream.id, body.lessonId, body.transcript));
        case "COMPREHENSION":
          return NextResponse.json(await submitComprehension(stream.id, body.lessonId, body.questionId, body.answer));
        case "PRODUCTION":
          return NextResponse.json(await submitProduction(stream.id, body.lessonId, body.text, now));
        case "REWRITE":
          return NextResponse.json(await submitRewrite(stream.id, body.lessonId, body.text));
        case "EXIT_TICKET":
          return NextResponse.json(await submitExitTicket(stream.id, body.lessonId, body.sentences, now));
      }
    });
  });
}

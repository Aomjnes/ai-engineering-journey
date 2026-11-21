import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { submitComprehension, submitExitTicket, submitProduction, submitRewrite, submitShadowing } from "@/lib/lessons/flow";
import { getLocalUser, requireProfile } from "@/lib/profile/service";

export const dynamic = "force-dynamic";
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
    const body = await parseBody(req, Body);
    const user = await getLocalUser();
    await requireProfile(user.id);
    const now = new Date();
    switch (body.stage) {
      case "INPUT":
        return NextResponse.json(await submitShadowing(user.id, body.lessonId, body.transcript));
      case "COMPREHENSION":
        return NextResponse.json(await submitComprehension(user.id, body.lessonId, body.questionId, body.answer));
      case "PRODUCTION":
        return NextResponse.json(await submitProduction(user.id, body.lessonId, body.text, now));
      case "REWRITE":
        return NextResponse.json(await submitRewrite(user.id, body.lessonId, body.text));
      case "EXIT_TICKET":
        return NextResponse.json(await submitExitTicket(user.id, body.lessonId, body.sentences, now));
    }
  });
}

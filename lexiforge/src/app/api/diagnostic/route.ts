import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { answerPlacement, placementStatus, startPlacement, startPromotionAudit, submitPlacementWriting, submitPromotionAudit } from "@/lib/diagnostic/service";
import { getProfile } from "@/lib/profile/service";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";
// Thorough grading measured 40–64 s on Gemini Flash; 60 s would cut real evaluations. Vercel Fluid Compute allows 300 s.
export const maxDuration = 300;

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), kind: z.enum(["PLACEMENT", "PROMOTION"]) }),
  z.object({
    action: z.literal("answer"),
    assessmentId: z.string().min(1),
    itemId: z.string().min(1),
    choices: z.array(z.number().int().min(0).max(3)).max(4).optional(),
    choice: z.number().int().min(0).max(4).optional(),
  }),
  z.object({ action: z.literal("write"), assessmentId: z.string().min(1), text: z.string().max(6000) }),
  z.object({
    action: z.literal("submitPromotion"),
    assessmentId: z.string().min(1),
    answers: z.array(z.object({ questionId: z.string().min(1), text: z.string().max(3000) })).min(1).max(5),
    writing: z.string().max(6000),
  }),
]);

export async function GET(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const [profile, placement] = await Promise.all([getProfile(stream.id), placementStatus(stream.id)]);
    return NextResponse.json({ calibrated: profile !== null, placement });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const body = await parseBody(req, BodySchema);
    const now = new Date();
    switch (body.action) {
      case "start":
        return NextResponse.json(body.kind === "PLACEMENT" ? await startPlacement(stream.id, now) : await startPromotionAudit(stream.id, now));
      case "answer":
        return NextResponse.json(await answerPlacement(stream.id, body.assessmentId, body));
      case "write":
        return NextResponse.json(await submitPlacementWriting(stream.id, body.assessmentId, body.text, now));
      case "submitPromotion":
        return NextResponse.json(await submitPromotionAudit(stream.id, body.assessmentId, body.answers, body.writing, now));
    }
  });
}

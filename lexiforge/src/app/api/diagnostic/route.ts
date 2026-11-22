import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { prisma } from "@/lib/db";
import { AnswerSchema, answerPlacement, placementStatus, SetupSchema, setupAndStartPlacement, skipPlacementWriting, startPromotionAudit, submitPlacementWriting, submitPromotionAudit } from "@/lib/diagnostic/service";
import { getProfile } from "@/lib/profile/service";
import { getGoal } from "@/lib/roadmap/service";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";
// Thorough grading measured 40–64 s on Gemini Flash; 60 s would cut real evaluations. Vercel Fluid Compute allows 300 s.
export const maxDuration = 300;

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup"), ...SetupSchema.shape }),
  z.object({ action: z.literal("start"), kind: z.literal("PROMOTION") }),
  z.object({ action: z.literal("answer"), assessmentId: z.string().min(1), unitId: z.string().min(1), answer: AnswerSchema }),
  z.object({ action: z.literal("write"), assessmentId: z.string().min(1), text: z.string().max(6000) }),
  z.object({ action: z.literal("skipWriting"), assessmentId: z.string().min(1) }),
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
    const [profile, placement, goal] = await Promise.all([getProfile(stream.id), placementStatus(stream.id), getGoal(stream.id)]);
    const milestones = await prisma.roadmapMilestone.count({ where: { streamId: stream.id } });
    return NextResponse.json({
      calibrated: profile !== null,
      placement,
      goal: goal ? { targetSubBand: goal.targetSubBand, dailyMinutes: goal.dailyMinutes, startComfort: goal.startComfort } : null,
      hasRoadmap: goal !== null && milestones > 0,
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const body = await parseBody(req, BodySchema);
    const now = new Date();
    switch (body.action) {
      case "setup":
        return NextResponse.json(await setupAndStartPlacement(stream.id, body, now));
      case "start":
        return NextResponse.json(await startPromotionAudit(stream.id, now));
      case "answer":
        return NextResponse.json(await answerPlacement(stream.id, body.assessmentId, body.unitId, body.answer, now));
      case "write":
        return NextResponse.json(await submitPlacementWriting(stream.id, body.assessmentId, body.text, now));
      case "skipWriting":
        return NextResponse.json(await skipPlacementWriting(stream.id, body.assessmentId, now));
      case "submitPromotion":
        return NextResponse.json(await submitPromotionAudit(stream.id, body.assessmentId, body.answers, body.writing, now));
    }
  });
}

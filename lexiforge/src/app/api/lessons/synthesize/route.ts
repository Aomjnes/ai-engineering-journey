import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { synthesizeLesson } from "@/lib/lessons/synthesize";
import { assertLessonsUnlocked } from "@/lib/accountability/service";
import { requireProfile } from "@/lib/profile/service";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";
// Thorough grading measured 40–64 s on Gemini Flash; 60 s would cut real evaluations. Vercel Fluid Compute allows 300 s.
export const maxDuration = 300;

const Body = z.object({ articleId: z.string().min(1).optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const { articleId } = await parseBody(req, Body);
    const profile = await requireProfile(stream.id);
    const now = new Date();
    await assertLessonsUnlocked(stream.id, now);
    const lesson = await synthesizeLesson(stream.id, profile, articleId, now);
    return NextResponse.json({ lessonId: lesson.id });
  });
}

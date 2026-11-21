import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody } from "@/lib/http";
import { synthesizeLesson } from "@/lib/lessons/synthesize";
import { assertLessonsUnlocked } from "@/lib/accountability/service";
import { getLocalUser, requireProfile } from "@/lib/profile/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ articleId: z.string().min(1).optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const { articleId } = await parseBody(req, Body);
    const user = await getLocalUser();
    const profile = await requireProfile(user.id);
    const now = new Date();
    await assertLessonsUnlocked(user.id, now);
    const lesson = await synthesizeLesson(user.id, profile, articleId, now);
    return NextResponse.json({ lessonId: lesson.id });
  });
}

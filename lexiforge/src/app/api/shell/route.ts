import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectProvider } from "@/lib/env";
import { handle } from "@/lib/http";
import { bandLabel, type SubBand } from "@/lib/metrics/scoring";
import { getLocalUser, getProfile } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

/** Lightweight status for the app shell (pill, badges, sync dot). */
export async function GET() {
  return handle(async () => {
    const user = await getLocalUser();
    const now = new Date();
    const [profile, overdue, lastFeed, active, failing] = await Promise.all([
      getProfile(user.id),
      prisma.srsCard.count({ where: { userId: user.id, dueAt: { lte: now } } }),
      prisma.sourceFeed.findFirst({ where: { lastFetchedAt: { not: null } }, orderBy: { lastFetchedAt: "desc" }, select: { lastFetchedAt: true } }),
      prisma.lessonUnit.findFirst({ where: { userId: user.id, stage: { not: "COMPLETED" } }, orderBy: { createdAt: "desc" }, select: { id: true } }),
      prisma.sourceFeed.count({ where: { status: "FAILING" } }),
    ]);
    return NextResponse.json({
      calibrated: profile !== null,
      subBand: profile ? bandLabel(profile.subBand as SubBand) : null,
      ielts: profile ? { band: profile.ieltsEstimate, low: profile.ieltsLow, high: profile.ieltsHigh } : null,
      dueCards: overdue,
      lastSyncedAt: lastFeed?.lastFetchedAt ?? null,
      failingFeeds: failing,
      llm: detectProvider()?.provider ?? null,
      activeLessonId: active?.id ?? null,
    });
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectProvider } from "@/lib/env";
import { handle } from "@/lib/http";
import { bandLabel, isBeginnerBand, type SubBand } from "@/lib/metrics/scoring";
import { getProfile } from "@/lib/profile/service";
import { requireStream } from "@/lib/auth/stream";

export const dynamic = "force-dynamic";

/** Lightweight status for the app shell (pill, badges, sync dot). */
export async function GET(req: Request) {
  return handle(async () => {
    const stream = await requireStream(req);
    const now = new Date();
    const [profile, overdue, lastFeed, active, failing, settings] = await Promise.all([
      getProfile(stream.id),
      prisma.srsCard.count({ where: { streamId: stream.id, dueAt: { lte: now } } }),
      prisma.sourceFeed.findFirst({ where: { lastFetchedAt: { not: null } }, orderBy: { lastFetchedAt: "desc" }, select: { lastFetchedAt: true } }),
      prisma.lessonUnit.findFirst({ where: { streamId: stream.id, stage: { not: "COMPLETED" } }, orderBy: { createdAt: "desc" }, select: { id: true } }),
      prisma.sourceFeed.count({ where: { status: "FAILING" } }),
      prisma.userSettings.findUnique({ where: { streamId: stream.id }, select: { uiLocale: true } }),
    ]);
    return NextResponse.json({
      calibrated: profile !== null,
      subBand: profile ? bandLabel(profile.subBand as SubBand) : null,
      ielts: profile ? { band: profile.ieltsEstimate, low: profile.ieltsLow, high: profile.ieltsHigh } : null,
      dueCards: overdue,
      lastSyncedAt: lastFeed?.lastFetchedAt ?? null,
      failingFeeds: failing,
      llm: detectProvider()?.provider ?? null,
      stream: { id: stream.id, code: stream.code, label: stream.label },
      uiLocale: settings ? (settings.uiLocale === "en" ? "en" : "vi") : null,
      beginner: profile ? isBeginnerBand(profile.subBand as SubBand) : true,
      serverTime: now.toISOString(),
      activeLessonId: active?.id ?? null,
    });
  });
}

import { prisma } from "@/lib/db";
import { detectProvider } from "@/lib/env";
import { accountabilityStatus } from "@/lib/accountability/service";
import { bandLabel, eriGate, ieltsEstimate, nextBand, promotionStatus, QUALIFYING_THRESHOLD, REQUIRED_CONSECUTIVE, type SubBand } from "@/lib/metrics/scoring";
import { applyDecay, computeRetention, loadProductionSessions } from "@/lib/profile/service";

const DAY = 86_400_000;

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function dashboardData(userId: string, now: Date) {
  const profile = await applyDecay(userId, now);
  if (!profile) return { calibrated: false as const, llm: detectProvider()?.provider ?? null };
  const [sessions, retention, snapshots, accountability, feeds, arsenal, production] = await Promise.all([
    loadProductionSessions(userId),
    computeRetention(userId, now),
    prisma.proficiencySnapshot.findMany({ where: { userId, takenAt: { gte: new Date(now.getTime() - 30 * DAY) } }, orderBy: { takenAt: "asc" } }),
    accountabilityStatus(userId, now),
    prisma.sourceFeed.findMany({ select: { name: true, status: true, lastFetchedAt: true, lastError: true, _count: { select: { articles: true } } }, orderBy: { name: "asc" } }),
    prisma.srsCard.findMany({ where: { userId, createdAt: { gte: new Date(now.getTime() - DAY) }, chunkId: { not: null } }, select: { front: true, back: true, createdAt: true } }),
    prisma.submissionAttempt.findMany({
      where: { userId, kind: { in: ["PRODUCTION", "DIAGNOSTIC_WRITING", "PROMOTION_AUDIT"] }, attemptNumber: 1, rejected: false },
      select: { createdAt: true, wordCount: true, errors: { select: { subtype: true, severity: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const band = profile.subBand as SubBand;
  const gate = eriGate(sessions);
  const promotion = promotionStatus({
    band,
    consecutiveQualifying: profile.consecutiveQualifying,
    eriGatePasses: gate.passes,
    eriOffending: gate.offending,
    rss: retention.matureReviews > 0 ? retention.rss : null,
  });
  const weeks: string[] = [];
  for (let i = 7; i >= 0; i--) weeks.push(isoWeek(new Date(now.getTime() - i * 7 * DAY)));
  const heat = new Map<string, Map<string, number>>();
  for (const p of production) {
    const w = isoWeek(p.createdAt);
    if (!weeks.includes(w)) continue;
    for (const e of p.errors) {
      const row = heat.get(e.subtype) ?? new Map<string, number>();
      row.set(w, (row.get(w) ?? 0) + 1);
      heat.set(e.subtype, row);
    }
  }
  const heatmap = [...heat.entries()]
    .map(([subtype, row]) => ({ subtype, total: [...row.values()].reduce((a, b) => a + b, 0), cells: weeks.map((w) => row.get(w) ?? 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const ielts = ieltsEstimate(profile.abilityLevel, profile.evidenceWords, profile.evidenceItems);
  return {
    calibrated: true as const,
    llm: detectProvider()?.provider ?? null,
    telemetry: {
      subBand: bandLabel(band),
      nextBand: nextBand(band) ? bandLabel(nextBand(band) as SubBand) : null,
      abilityLevel: profile.abilityLevel,
      ielts: { band: ielts.band, low: ielts.low, high: ielts.high, halfWidth: ielts.halfWidth },
      consecutiveQualifying: profile.consecutiveQualifying,
      requiredConsecutive: REQUIRED_CONSECUTIVE,
      qualifyingThreshold: QUALIFYING_THRESHOLD[band],
      promotion,
      evidence: { words: profile.evidenceWords, items: profile.evidenceItems, rssReviews: retention.matureReviews, eriSessions: sessions.length },
    },
    radar: [
      { metric: "GAI", value: profile.gai, hasEvidence: true },
      { metric: "LRI", value: profile.lri, hasEvidence: true },
      { metric: "CPR", value: profile.cpr, hasEvidence: true },
      { metric: "RSS", value: retention.rss ?? 0, hasEvidence: retention.rss !== null },
      { metric: "ERI", value: profile.eri, hasEvidence: sessions.length >= 2 },
    ],
    composite: profile.composite,
    trend: snapshots.map((s) => ({ t: s.takenAt.toISOString(), gai: s.gai, lri: s.lri, cpr: s.cpr, rss: s.rss, eri: s.eri, composite: s.composite, level: s.abilityLevel, trigger: s.trigger })),
    errorDecay: production.map((p) => ({ t: p.createdAt.toISOString(), e100: p.wordCount ? Math.round((1000 * p.errors.length) / p.wordCount) / 10 : 0 })),
    heatmap: { weeks, rows: heatmap },
    accountability,
    feeds: feeds.map((f) => ({ name: f.name, status: f.status, lastFetchedAt: f.lastFetchedAt, lastError: f.lastError, articles: f._count.articles })),
    arsenal: arsenal.map((c) => {
      let sentence = "";
      try {
        sentence = (JSON.parse(c.back) as { sentence?: string }).sentence ?? "";
      } catch {
        sentence = "";
      }
      return { phrase: c.front, sentence };
    }),
  };
}

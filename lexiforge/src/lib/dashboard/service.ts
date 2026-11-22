import { prisma } from "@/lib/db";
import { detectProvider } from "@/lib/env";
import { accountabilityStatus } from "@/lib/accountability/service";
import { bandLabel, COMPOSITE_WEIGHTS, computeEri, eriGate, ieltsEstimate, nextBand, promotionStatus, QUALIFYING_THRESHOLD, REQUIRED_CONSECUTIVE, RECURRENCE_CEILING, RSS_PROMOTION_FLOOR, type SubBand } from "@/lib/metrics/scoring";
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

export async function dashboardData(streamId: string, now: Date) {
  const profile = await applyDecay(streamId, now);
  if (!profile) return { calibrated: false as const, llm: detectProvider()?.provider ?? null };
  const [sessions, retention, snapshots, accountability, feeds, arsenal, production] = await Promise.all([
    loadProductionSessions(streamId),
    computeRetention(streamId, now),
    prisma.proficiencySnapshot.findMany({ where: { streamId, takenAt: { gte: new Date(now.getTime() - 30 * DAY) } }, orderBy: { takenAt: "asc" } }),
    accountabilityStatus(streamId, now),
    prisma.sourceFeed.findMany({ select: { name: true, status: true, lastFetchedAt: true, lastError: true, _count: { select: { articles: true } } }, orderBy: { name: "asc" } }),
    prisma.srsCard.findMany({ where: { streamId, createdAt: { gte: new Date(now.getTime() - DAY) }, chunkId: { not: null } }, select: { front: true, back: true, createdAt: true } }),
    prisma.submissionAttempt.findMany({
      where: { streamId, kind: { in: ["PRODUCTION", "DIAGNOSTIC_WRITING", "PROMOTION_AUDIT"] }, attemptNumber: 1, rejected: false },
      select: { createdAt: true, wordCount: true, gai: true, lri: true, errors: { select: { subtype: true, severity: true } } },
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
  const next = nextBand(band);
  const rssEvidence = retention.matureReviews > 0;
  type CheckStatus = "PASS" | "PROGRESS" | "BLOCKED" | "LOCKED" | "NO_DATA";
  const checks: Array<{ key: string; label: string; status: CheckStatus; detail: string; params: Record<string, string | number> }> = [
    {
      key: "sessions",
      label: "Qualifying sessions",
      status: profile.consecutiveQualifying >= REQUIRED_CONSECUTIVE ? "PASS" : "PROGRESS",
      detail: `${profile.consecutiveQualifying}/${REQUIRED_CONSECUTIVE} consecutive · composite ≥ ${QUALIFYING_THRESHOLD[band]} on ≥ ${bandLabel(band)} text, first-try gate pass`,
      params: { n: profile.consecutiveQualifying, req: REQUIRED_CONSECUTIVE, thr: QUALIFYING_THRESHOLD[band], band: bandLabel(band) },
    },
    {
      key: "eri",
      label: "Critical error recurrence",
      status: gate.passes ? "PASS" : "BLOCKED",
      detail: gate.passes ? `No critical pattern in > ${RECURRENCE_CEILING} of last 5 sessions` : `Over ceiling: ${gate.offending.join(", ")}`,
      params: { n: RECURRENCE_CEILING, list: gate.offending.join(", ") },
    },
    {
      key: "rss",
      label: `Retention ≥ ${RSS_PROMOTION_FLOOR}`,
      status: !rssEvidence ? "NO_DATA" : (retention.rss ?? 0) >= RSS_PROMOTION_FLOOR ? "PASS" : "BLOCKED",
      detail: rssEvidence ? `RSS ${retention.rss?.toFixed(1)} from ${retention.matureReviews} mature reviews` : "No reviews ≥ 7 days old yet — not required until evidence exists",
      params: { floor: RSS_PROMOTION_FLOOR, v: retention.rss?.toFixed(1) ?? "—", n: retention.matureReviews, evidence: rssEvidence ? 1 : 0 },
    },
    {
      key: "audit",
      label: "Band Promotion Audit",
      status: promotion.unlocked ? "PASS" : "LOCKED",
      detail: promotion.unlocked ? `Unlocked — zero-hint audit at ${next ? bandLabel(next) : "—"}` : "Unlocks when every check above passes",
      params: { band: next ? bandLabel(next) : "—" },
    },
  ];
  const weekAgo = now.getTime() - 7 * DAY;
  const baseline = [...snapshots].reverse().find((s) => s.takenAt.getTime() <= weekAgo) ?? snapshots[0];
  const latest = snapshots[snapshots.length - 1];
  const weekDelta = baseline && latest && baseline !== latest ? { gai: latest.gai - baseline.gai, level: latest.abilityLevel - baseline.abilityLevel, composite: latest.composite - baseline.composite } : null;
  const recent = production.slice(-5);
  const avg = (xs: Array<number | null>) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const recentCpr = await prisma.submissionAttempt.findMany({ where: { streamId, kind: "COMPREHENSION", attemptNumber: 1 }, orderBy: { createdAt: "desc" }, take: 9, select: { cpr: true } });
  const eri = computeEri(sessions, now);
  const ledger = {
    weights: COMPOSITE_WEIGHTS,
    recent: {
      sessions: recent.length,
      gai: avg(recent.map((r) => r.gai)),
      lri: avg(recent.map((r) => r.lri)),
      cpr: avg(recentCpr.map((r) => r.cpr)),
      cprItems: recentCpr.length,
      e100: avg(recent.map((r) => (r.wordCount ? (100 * r.errors.length) / r.wordCount : null))),
    },
    rss: { r7: retention.r7, r30: retention.r30, current: retention.current, matureReviews: retention.matureReviews },
    eri: { density: eri.recurrenceDensity, recurring: eri.recurringSubtypes, sessions: sessions.length },
    level: profile.abilityLevel,
    decayedDays: profile.decayedDays,
    lastActivityAt: profile.lastActivityAt,
  };
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
      checks,
      weekDelta,
      decaying: profile.decayedDays > 0,
      benchmark: next ? QUALIFYING_THRESHOLD[next] : null,
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
    ledger,
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

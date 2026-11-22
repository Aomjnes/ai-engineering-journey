"use client";

import { useCallback, useEffect, useState } from "react";
import { useCrossDeviceSync } from "@/components/lf/shell-data";
import { useRouter } from "next/navigation";
import type { dashboardData } from "@/lib/dashboard/service";
import { api } from "@/lib/client/api";
import { fmt, ieltsText, subtypeLabel } from "@/lib/i18n";
import { usePrefs } from "@/components/lf/prefs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorDecayChart, ErrorHeatmap, SkillRadar, TrajectoryChart } from "@/components/charts";
import { MetricInfo, MetricTooltip, type MetricKey } from "@/components/lf/metric-tooltip";
import { PromotionAction, PromotionLockList } from "@/components/lf/promotion-lock-card";
import { EmptyState } from "@/components/lf/states";

type DashboardResponse = Awaited<ReturnType<typeof dashboardData>>;
type Dashboard = Extract<DashboardResponse, { calibrated: true }>;

const f = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : v.toFixed(d));

export default function MetricsPage() {
  const router = useRouter();
  const { t: tr, err } = usePrefs();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<DashboardResponse>("/api/dashboard")
      .then((d) => (d.calibrated ? setData(d) : router.replace("/onboarding")))
      .catch((e) => setError(err(e)));
  }, [router, err]);
  useEffect(() => load(), [load]);
  useCrossDeviceSync(load);

  if (error) return <EmptyState title={tr.metrics.loadFailed} body={error} />;
  if (!data)
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );

  const t = data.telemetry;
  const L = data.ledger;
  const radar = data.radar;
  const val = (m: string) => radar.find((r) => r.metric === m);
  const ledgerRows: Array<{ metric: string; current: string; recent: string; evidence: string; formula: string; weight: number | null }> = [
    { metric: tr.metric.gaiName, current: f(val("GAI")?.value), recent: f(L.recent.gai), evidence: fmt(tr.metrics.evDrafts, { n: L.recent.sessions }), formula: "0.6·100·e^(−E100/10) + 0.4·100·EFSR · weights C3 / M1.5 / m0.5", weight: L.weights.gai },
    { metric: tr.metric.lriName, current: f(val("LRI")?.value), recent: f(L.recent.lri), evidence: fmt(tr.metrics.evDrafts, { n: L.recent.sessions }), formula: "0.35·chunk deployment + 0.30·Guiraud (types/√tokens) + 0.35·collocation naturalness", weight: L.weights.lri },
    { metric: tr.metric.cprName, current: f(val("CPR")?.value), recent: f(L.recent.cpr), evidence: fmt(tr.metrics.evAnswers, { n: L.recent.cprItems }), formula: "mean rubric score of first attempts; copy-paste (Jaccard > 0.65) scores 0", weight: L.weights.cpr },
    { metric: tr.metric.rssName, current: val("RSS")?.hasEvidence ? f(val("RSS")?.value) : tr.metrics.noData, recent: `R7 ${f(L.rss.r7 === null ? null : L.rss.r7 * 100)} · R30 ${f(L.rss.r30 === null ? null : L.rss.r30 * 100)} · now ${f(L.rss.current === null ? null : L.rss.current * 100)}`, evidence: fmt(tr.metrics.evReviews, { n: L.rss.matureReviews }), formula: "100·(0.5·(0.4·R7 + 0.6·R30) + 0.5·mean FSRS retrievability now)", weight: L.weights.rss },
    { metric: tr.metric.eriName, current: val("ERI")?.hasEvidence ? f(val("ERI")?.value) : tr.metrics.noData, recent: `${f(L.eri.density, 2)} /100w`, evidence: fmt(tr.metrics.evSessions, { n: L.eri.sessions }), formula: "100·e^(−recurrence density/4), recurrences = repeated subtypes, last 14 days", weight: L.weights.eri },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{tr.metrics.eyebrow}</p>
          <h1 className="mt-1 font-serif text-[30px] font-medium leading-tight tracking-[-0.015em]">{tr.metrics.title}</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-ink-2">{tr.metrics.sub}</p>
        </div>
        <div className="flex items-baseline gap-4 rounded-lg border border-line bg-card px-5 py-3">
          <span className="num text-[28px] font-semibold">{t.subBand}</span>
          <span className="num text-[14px] text-ink-2">IELTS ≈ {ieltsText(t.ielts.band)} <span className="text-ink-3">({t.ielts.low.toFixed(1)}–{t.ielts.high.toFixed(1)})</span></span>
        </div>
      </header>

      <section aria-labelledby="explain-title" className="rounded-lg border border-line bg-card p-5">
        <h2 id="explain-title" className="text-[15px] font-semibold">{tr.metrics.explainTitle}</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(["gai", "lri", "cpr", "rss", "eri", "cefr", "ielts"] as MetricKey[]).map((k) => {
            const m = tr.metric as Record<string, string>;
            return (
              <div key={k}>
                <dt className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">{m[`${k}Name`]} <MetricInfo metric={k} /></dt>
                <dd className="mt-1 text-[13px] leading-relaxed text-ink-2">{m[`${k}What`]}</dd>
                <dd className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{m[`${k}How`]}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr] [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              {tr.metrics.radar}
              <MetricTooltip label={tr.metrics.radar}>{fmt(tr.metrics.radarTip, { band: t.nextBand ?? "—" })}</MetricTooltip>
            </CardTitle>
            <CardDescription className="tabular-nums">{fmt(tr.metrics.radarSub, { c: data.composite.toFixed(1), l: t.abilityLevel.toFixed(1) })}</CardDescription>
          </CardHeader>
          <CardContent>
            <SkillRadar data={radar} benchmark={t.benchmark} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tr.metrics.trajectory}</CardTitle>
            <CardDescription>{tr.metrics.trajectorySub}</CardDescription>
          </CardHeader>
          <CardContent>
            <TrajectoryChart data={data.trend} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              {tr.metrics.e100}
              <MetricTooltip label={tr.metrics.e100}>{tr.metrics.e100Tip}</MetricTooltip>
            </CardTitle>
            <CardDescription>{tr.metrics.e100Sub}</CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorDecayChart data={data.errorDecay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tr.metrics.heatmap}</CardTitle>
            <CardDescription>{tr.metrics.heatmapSub}</CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorHeatmap weeks={data.heatmap.weeks} rows={data.heatmap.rows} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tr.metrics.ledger}</CardTitle>
          <CardDescription>{tr.metrics.ledgerSub}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wider text-ink-3">
                <th className="py-2 pr-3 font-semibold">{tr.metrics.colDim}</th>
                <th className="py-2 pr-3 text-right font-semibold">{tr.metrics.colCurrent}</th>
                <th className="py-2 pr-3 text-right font-semibold">{tr.metrics.colRecent}</th>
                <th className="py-2 pr-3 text-right font-semibold">{tr.metrics.colWeight}</th>
                <th className="py-2 pr-3 font-semibold">{tr.metrics.colEvidence}</th>
                <th className="py-2 font-semibold">{tr.metrics.colFormula}</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((r) => (
                <tr key={r.metric} className="border-b border-line align-top">
                  <td className="py-2.5 pr-3 font-medium">{r.metric}</td>
                  <td className="num py-2.5 pr-3 text-right">{r.current}</td>
                  <td className="num py-2.5 pr-3 text-right text-ink-2">{r.recent}</td>
                  <td className="num py-2.5 pr-3 text-right text-ink-2">{r.weight === null ? "—" : r.weight.toFixed(2)}</td>
                  <td className="py-2.5 pr-3 text-[12.5px] tabular-nums text-ink-3">{r.evidence}</td>
                  <td className="py-2.5 font-mono text-[11.5px] leading-relaxed text-ink-2">{r.formula}</td>
                </tr>
              ))}
              <tr className="border-b border-line align-top">
                <td className="py-2.5 pr-3 font-medium">{tr.metric.compositeName}</td>
                <td className="num py-2.5 pr-3 text-right">{data.composite.toFixed(1)}</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">—</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">1.00</td>
                <td className="py-2.5 pr-3 text-[12.5px] tabular-nums text-ink-3">{tr.metrics.evDims}</td>
                <td className="py-2.5 font-mono text-[11.5px] text-ink-2">weighted mean, renormalized over dimensions that have evidence</td>
              </tr>
              <tr className="border-b border-line align-top">
                <td className="py-2.5 pr-3 font-medium">{fmt(tr.metrics.abilityRow, { band: t.subBand })}</td>
                <td className="num py-2.5 pr-3 text-right">{L.level.toFixed(1)}</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">—</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">—</td>
                <td className="py-2.5 pr-3 text-[12.5px] tabular-nums text-ink-3">{L.decayedDays > 0 ? fmt(tr.metrics.decayDays, { n: L.decayedDays }) : tr.metrics.noDecay}</td>
                <td className="py-2.5 font-mono text-[11.5px] leading-relaxed text-ink-2">L ← L + 0.25·m·(D + 0.5·(P − 70) − L); Pre-A1 0–14 · A1.1 15–24 · A1.2 25–33 · A2.1 34–43 · A2.2 44–52 · B1.1 53–60 · B1.2 61–68 · B2.1 69–75 · B2.2 76–82 · C1.1 83–89 · C1.2 90+; −0.5/day after 7 idle days</td>
              </tr>
              <tr className="align-top">
                <td className="py-2.5 pr-3 font-medium">{tr.metric.ieltsName}</td>
                <td className="num py-2.5 pr-3 text-right">{ieltsText(t.ielts.band)}</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">±{t.ielts.halfWidth}</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">—</td>
                <td className="py-2.5 pr-3 text-[12.5px] tabular-nums text-ink-3">{fmt(tr.metrics.wordsItems, { w: t.evidence.words, i: t.evidence.items })}</td>
                <td className="py-2.5 font-mono text-[11.5px] leading-relaxed text-ink-2">per sub-band: Pre-A1 &lt;3.0 · A1.1 3.0 · A1.2 3.5 · A2.1 4.0 · A2.2 4.5 · B1.1 5.0 · B1.2 5.5 · B2.1 6.0 · B2.2 6.5 · C1.1 7.0–7.5 · C1.2 8.0–8.5; CI ±1.96/√(1 + words/150 + items/10)</td>
              </tr>
            </tbody>
          </table>
          {Object.keys(L.eri.recurring).length > 0 && (
            <p className="mt-3 text-[12.5px] text-ink-3">
              {fmt(tr.metrics.recurringNow, { list: Object.entries(L.eri.recurring).map(([k, v]) => `${subtypeLabel(tr, k)} ×${v}`).join(" · ") })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{fmt(tr.metrics.lockTitle, { band: t.nextBand ?? tr.today.topBand })}</CardTitle>
          <CardDescription>{tr.metrics.lockSub}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <PromotionLockList checks={t.checks} />
          <div className="md:w-56">
            <PromotionAction unlocked={t.promotion.unlocked} nextBand={t.nextBand} metricsLink={false} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

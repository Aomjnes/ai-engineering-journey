"use client";

import { useCallback, useEffect, useState } from "react";
import { useCrossDeviceSync } from "@/components/lf/shell-data";
import { useRouter } from "next/navigation";
import type { dashboardData } from "@/lib/dashboard/service";
import { api, errorMessage } from "@/lib/client/api";
import { humanize } from "@/lib/client/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorDecayChart, ErrorHeatmap, SkillRadar, TrajectoryChart } from "@/components/charts";
import { MetricTooltip } from "@/components/lf/metric-tooltip";
import { PromotionAction, PromotionLockList } from "@/components/lf/promotion-lock-card";
import { EmptyState } from "@/components/lf/states";

type DashboardResponse = Awaited<ReturnType<typeof dashboardData>>;
type Dashboard = Extract<DashboardResponse, { calibrated: true }>;

const f = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : v.toFixed(d));

export default function MetricsPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<DashboardResponse>("/api/dashboard")
      .then((d) => (d.calibrated ? setData(d) : router.replace("/onboarding")))
      .catch((e) => setError(errorMessage(e)));
  }, [router]);
  useEffect(() => load(), [load]);
  useCrossDeviceSync(load);

  if (error) return <EmptyState title="Metrics could not load" body={error} />;
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
    { metric: "GAI · Grammatical Accuracy", current: f(val("GAI")?.value), recent: f(L.recent.gai), evidence: `${L.recent.sessions} recent first drafts`, formula: "0.6·100·e^(−E100/10) + 0.4·100·EFSR · weights C3 / M1.5 / m0.5", weight: L.weights.gai },
    { metric: "LRI · Lexical Resource", current: f(val("LRI")?.value), recent: f(L.recent.lri), evidence: `${L.recent.sessions} recent first drafts`, formula: "0.35·chunk deployment + 0.30·Guiraud (types/√tokens) + 0.35·collocation naturalness", weight: L.weights.lri },
    { metric: "CPR · Comprehension Precision", current: f(val("CPR")?.value), recent: f(L.recent.cpr), evidence: `${L.recent.cprItems} first-attempt answers`, formula: "mean rubric score of first attempts; copy-paste (Jaccard > 0.65) scores 0", weight: L.weights.cpr },
    { metric: "RSS · Retention Stability", current: val("RSS")?.hasEvidence ? f(val("RSS")?.value) : "no data", recent: `R7 ${f(L.rss.r7 === null ? null : L.rss.r7 * 100)} · R30 ${f(L.rss.r30 === null ? null : L.rss.r30 * 100)} · now ${f(L.rss.current === null ? null : L.rss.current * 100)}`, evidence: `${L.rss.matureReviews} mature reviews`, formula: "100·(0.5·(0.4·R7 + 0.6·R30) + 0.5·mean FSRS retrievability now)", weight: L.weights.rss },
    { metric: "ERI · Error Recurrence", current: val("ERI")?.hasEvidence ? f(val("ERI")?.value) : "no data", recent: `${f(L.eri.density, 2)} rec./100w`, evidence: `${L.eri.sessions} production sessions`, formula: "100·e^(−recurrence density/4), recurrences = repeated subtypes, last 14 days", weight: L.weights.eri },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Psychometric analytics</p>
          <h1 className="mt-1 font-serif text-[30px] font-medium leading-tight tracking-[-0.015em]">Proficiency evidence</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-ink-2">Every number on this page is computed by deterministic, unit-tested formulas from your graded work. The language model supplies error evidence only — never scores.</p>
        </div>
        <div className="flex items-baseline gap-4 rounded-lg border border-line bg-card px-5 py-3">
          <span className="num text-[28px] font-semibold">{t.subBand}</span>
          <span className="num text-[14px] text-ink-2">IELTS ≈ {t.ielts.band.toFixed(1)} <span className="text-ink-3">({t.ielts.low.toFixed(1)}–{t.ielts.high.toFixed(1)})</span></span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr] [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              5-axis skill radar
              <MetricTooltip label="the radar">Scores on 0–100. The dashed ring is the composite a session must reach to qualify at the next sub-band ({t.nextBand ?? "—"}). Axes marked n/a have no evidence yet and are excluded from the composite.</MetricTooltip>
            </CardTitle>
            <CardDescription className="tabular-nums">composite {data.composite.toFixed(1)} · level {t.abilityLevel.toFixed(1)}/100</CardDescription>
          </CardHeader>
          <CardContent>
            <SkillRadar data={radar} benchmark={t.benchmark} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>30-day trajectory</CardTitle>
            <CardDescription>Snapshot after every verified session, decay and promotion. Toggle series above the chart.</CardDescription>
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
              Errors per 100 words
              <MetricTooltip label="errors per 100 words">Raw logged errors ÷ words × 100 on first-attempt production only. Rewrites never count, so the curve cannot be gamed by repairing after feedback.</MetricTooltip>
            </CardTitle>
            <CardDescription>Separate scale from the 0–100 scores, so it has its own chart.</CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorDecayChart data={data.errorDecay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recurring error heatmap</CardTitle>
            <CardDescription>Occurrences per pattern per ISO week, last 8 weeks.</CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorHeatmap weeks={data.heatmap.weeks} rows={data.heatmap.rows} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CEFR &amp; IELTS evidence ledger</CardTitle>
          <CardDescription>How your current estimate is built — formulas, live values and how much evidence stands behind each.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wider text-ink-3">
                <th className="py-2 pr-3 font-semibold">Dimension</th>
                <th className="py-2 pr-3 text-right font-semibold">Current</th>
                <th className="py-2 pr-3 text-right font-semibold">Recent raw</th>
                <th className="py-2 pr-3 text-right font-semibold">Weight</th>
                <th className="py-2 pr-3 font-semibold">Evidence</th>
                <th className="py-2 font-semibold">Formula</th>
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
                <td className="py-2.5 pr-3 font-medium">Composite</td>
                <td className="num py-2.5 pr-3 text-right">{data.composite.toFixed(1)}</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">—</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">1.00</td>
                <td className="py-2.5 pr-3 text-[12.5px] tabular-nums text-ink-3">dims with evidence</td>
                <td className="py-2.5 font-mono text-[11.5px] text-ink-2">weighted mean, renormalized over dimensions that have evidence</td>
              </tr>
              <tr className="border-b border-line align-top">
                <td className="py-2.5 pr-3 font-medium">Ability level → {t.subBand}</td>
                <td className="num py-2.5 pr-3 text-right">{L.level.toFixed(1)}</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">—</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">—</td>
                <td className="py-2.5 pr-3 text-[12.5px] tabular-nums text-ink-3">{L.decayedDays > 0 ? `${L.decayedDays} decay day(s)` : "no decay"}</td>
                <td className="py-2.5 font-mono text-[11.5px] leading-relaxed text-ink-2">L ← L + 0.25·m·(D + 0.5·(P − 70) − L); 12.5 points per sub-band; −0.5/day after 7 idle days</td>
              </tr>
              <tr className="align-top">
                <td className="py-2.5 pr-3 font-medium">IELTS estimate</td>
                <td className="num py-2.5 pr-3 text-right">{t.ielts.band.toFixed(1)}</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">±{t.ielts.halfWidth}</td>
                <td className="num py-2.5 pr-3 text-right text-ink-2">—</td>
                <td className="py-2.5 pr-3 text-[12.5px] tabular-nums text-ink-3">{t.evidence.words} words · {t.evidence.items} items</td>
                <td className="py-2.5 font-mono text-[11.5px] leading-relaxed text-ink-2">piecewise-linear (0,4.0)(25,4.5)(50,5.5)(75,7.0)(100,8.5); CI ±1.96/√(1 + words/150 + items/10)</td>
              </tr>
            </tbody>
          </table>
          {Object.keys(L.eri.recurring).length > 0 && (
            <p className="mt-3 text-[12.5px] text-ink-3">
              Recurring in the last 14 days: {Object.entries(L.eri.recurring).map(([k, v]) => `${humanize(k)} ×${v}`).join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Promotion lock → {t.nextBand ?? "top band"}</CardTitle>
          <CardDescription>The sub-band only moves through these gates. One non-qualifying session resets the counter.</CardDescription>
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

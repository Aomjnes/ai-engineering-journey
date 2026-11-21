"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import type { dashboardData } from "@/lib/dashboard/service";
import { api, errorMessage } from "@/lib/client/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorDecayChart, ErrorHeatmap, SkillRadar, TrendChart } from "@/components/charts";

type Dashboard = Extract<Awaited<ReturnType<typeof dashboardData>>, { calibrated: true }>;

interface LessonsResponse {
  level: number;
  target: number;
  articles: Array<{ id: string; title: string; source: string; url: string; publishedAt: string | null; cefrTier: string; difficulty: number; fkGrade: number; wordCount: number; match: string; delivery: string }>;
  lessons: Array<{ id: string; title: string; stage: string; createdAt: string; isGraded: boolean }>;
}

export function DashboardView() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [lessons, setLessons] = useState<LessonsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Awaited<ReturnType<typeof dashboardData>>>("/api/dashboard");
      if (!d.calibrated) {
        router.replace("/onboarding");
        return;
      }
      setData(d);
      setLessons(await api<LessonsResponse>("/api/lessons"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sync() {
    setSyncing(true);
    setSyncReport(null);
    try {
      const r = await api<{ stored: number; feeds: Array<{ feed: string; ok: boolean; error?: string }> }>("/api/ingest", {});
      const failed = r.feeds.filter((f) => !f.ok);
      setSyncReport(`Stored ${r.stored} new article(s). ${failed.length ? `Unreachable: ${failed.map((f) => f.feed).join(", ")}.` : "All feeds reachable."}`);
      await load();
    } catch (e) {
      setSyncReport(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  }

  async function start(articleId: string) {
    setStarting(articleId);
    setError(null);
    try {
      const r = await api<{ lessonId: string }>("/api/lessons/synthesize", { articleId });
      router.push(`/lesson/${r.lessonId}`);
    } catch (e) {
      setError(errorMessage(e));
      setStarting(null);
    }
  }

  if (error && !data) return <p className="text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading telemetry…</p>;
  const t = data.telemetry;
  const acc = data.accountability;

  return (
    <div className="flex flex-col gap-6">
      {!data.llm && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>No LLM key configured. Grading, lesson synthesis and the explainer are disabled. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY to <code>.env</code> and restart.</span>
        </div>
      )}

      {/* Proficiency telemetry header */}
      <section className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardDescription>Current CEFR sub-band</CardDescription>
            <CardTitle className="text-3xl font-bold">{t.subBand}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Ability level {t.abilityLevel.toFixed(1)} / 100 · composite {data.composite.toFixed(1)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Estimated IELTS band (diagnostic equivalent)</CardDescription>
            <CardTitle className="text-3xl font-bold">{t.ielts.band.toFixed(1)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            95% interval {t.ielts.low.toFixed(1)}–{t.ielts.high.toFixed(1)} (±{t.ielts.halfWidth}) · based on {t.evidence.words} graded words, {t.evidence.items} items
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Promotion to {t.nextBand ?? "—"}</CardDescription>
            <CardTitle className="text-3xl font-bold">
              {t.consecutiveQualifying}/{t.requiredConsecutive}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="h-1.5 w-full rounded bg-muted">
              <div className="h-1.5 rounded bg-primary" style={{ width: `${Math.min(100, (100 * t.consecutiveQualifying) / t.requiredConsecutive)}%` }} />
            </div>
            {t.promotion.unlocked ? (
              <Link href="/promotion" className="inline-flex items-center gap-1 font-medium text-primary">
                Band Promotion Audit unlocked <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            ) : (
              <ul className="space-y-1 text-muted-foreground">
                {t.promotion.unmet.map((u) => (
                  <li key={u} className="flex gap-1">
                    <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    {u}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Accountability */}
      {acc.locked ? (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <div>
              <p className="font-semibold">New lessons are locked. You have unpaid error debt.</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {acc.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {acc.top.length > 0 && <p className="mt-1">Your top recurring mistakes: {acc.top.map((p) => `${p.subtype} ×${p.count}`).join(", ")}.</p>}
            </div>
          </div>
          <Button variant="destructive" onClick={() => router.push("/graveyard#detox")}>Start 5-minute Error Detox</Button>
        </div>
      ) : (
        (acc.overdueCards > 0 || acc.errorDebt > 0) && (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            {acc.overdueCards} overdue review card(s) · recurring-error debt {acc.errorDebt}. Lock triggers at 15 cards or debt 12.{" "}
            <Link href="/graveyard" className="text-primary">Review now</Link>
          </div>
        )
      )}

      {/* Today's lessons */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Today&apos;s i+1-matched live lessons</h2>
            {lessons && <p className="text-xs text-muted-foreground">Your level {lessons.level.toFixed(1)} → target difficulty {lessons.target.toFixed(1)}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
            {syncing ? "Syncing…" : "Sync Live Content Now"}
          </Button>
        </div>
        {syncReport && <p className="mb-2 text-xs text-muted-foreground">{syncReport}</p>}
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        {lessons && lessons.articles.length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No unused articles from the last 3 days. Press “Sync Live Content Now”.</p>}
        <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
          {lessons?.articles.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{a.source}</Badge>
                  <Badge>{a.cefrTier}</Badge>
                  <Badge variant={a.match === "i+1 match" ? "success" : a.match === "too hard" ? "critical" : "minor"}>{a.match}</Badge>
                  {a.delivery === "GRADED_BRIDGE" && <Badge variant="minor">graded bridge + original</Badge>}
                </div>
                <CardTitle className="mt-1 leading-snug">{a.title}</CardTitle>
                <CardDescription>
                  {a.publishedAt ? new Date(a.publishedAt).toLocaleString() : "date unknown"} · D {a.difficulty.toFixed(1)} · FK grade {a.fkGrade.toFixed(1)} · {a.wordCount} words
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">Original article</a>
                <Button size="sm" onClick={() => start(a.id)} disabled={starting !== null || acc.locked || !data.llm}>
                  {starting === a.id ? "Building lesson…" : "Start lesson"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        {lessons && lessons.lessons.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Your lessons</h3>
            <ul className="divide-y rounded-md border text-sm">
              {lessons.lessons.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-3 py-2">
                  <Link href={`/lesson/${l.id}`} className="hover:underline">{l.title}</Link>
                  <Badge variant={l.stage === "COMPLETED" ? "success" : "outline"}>{l.stage}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Metrics */}
      <section className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>5-axis skill radar</CardTitle>
            <CardDescription>GAI grammar · LRI lexis · CPR comprehension · RSS retention · ERI error decay (0–100)</CardDescription>
          </CardHeader>
          <CardContent>
            <SkillRadar data={data.radar} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>30-day trend</CardTitle>
            <CardDescription>Proficiency snapshots after every verified session</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={data.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Errors per 100 words</CardTitle>
            <CardDescription>First-attempt production only — rewrites never count</CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorDecayChart data={data.errorDecay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recurring error heatmap</CardTitle>
            <CardDescription>Occurrences per error pattern per ISO week (last 8 weeks)</CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorHeatmap weeks={data.heatmap.weeks} rows={data.heatmap.rows} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s acquired arsenal</CardTitle>
            <CardDescription>Chunks locked into FSRS in the last 24 hours, with your own sentence</CardDescription>
          </CardHeader>
          <CardContent>
            {data.arsenal.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing locked in yet today. Finish a lesson&apos;s exit ticket.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.arsenal.map((a) => (
                  <li key={a.phrase + a.sentence}>
                    <span className="font-semibold">{a.phrase}</span>
                    <span className="block text-muted-foreground">{a.sentence}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Live sources</CardTitle>
            <CardDescription>Feed health from the last ingestion</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs">
              {data.feeds.map((f) => (
                <li key={f.name} className="flex items-center justify-between gap-2">
                  <span>{f.name}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {f.articles} articles
                    <Badge variant={f.status === "ACTIVE" ? "success" : f.status === "FAILING" ? "critical" : "minor"} title={f.lastError ?? undefined}>
                      {f.lastFetchedAt ? f.status : "never fetched"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

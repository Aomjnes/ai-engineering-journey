"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock, ExternalLink, KeyRound, Lock, Newspaper, RefreshCw, ShieldAlert } from "lucide-react";
import type { dashboardData } from "@/lib/dashboard/service";
import { api, errorMessage } from "@/lib/client/api";
import { humanize, signed, timeAgo } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/lf/states";
import { PromotionAction, PromotionLockList } from "@/components/lf/promotion-lock-card";
import { useCrossDeviceSync, useShell } from "@/components/lf/shell-data";

type DashboardResponse = Awaited<ReturnType<typeof dashboardData>>;
type Dashboard = Extract<DashboardResponse, { calibrated: true }>;

interface Article {
  id: string;
  title: string;
  source: string;
  topic: string;
  url: string;
  preview: string;
  publishedAt: string | null;
  cefrTier: string;
  difficulty: number;
  wordCount: number;
  estMinutes: number;
  match: string;
  delivery: "GRADED_BRIDGE" | "AUTHENTIC";
}
interface LessonRow {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  stage: string;
  isGraded: boolean;
  chunkCount: number;
  difficulty: number;
}
interface LessonsResponse {
  level: number;
  target: number;
  articles: Article[];
  lessons: LessonRow[];
}

const STAGE_NUM: Record<string, number> = { INPUT: 1, COMPREHENSION: 2, PRODUCTION: 3, EXIT_TICKET: 4, COMPLETED: 4 };
const tierLabel = (subBand: string, a: Article) => (a.delivery === "GRADED_BRIDGE" ? `${subBand} Bridge + Original` : `Authentic ${a.cefrTier}`);

function TodaySkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading today's briefing">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-px overflow-hidden rounded-lg border border-line md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 bg-card p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-lg border border-line bg-card p-5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BriefingCard({ a, subBand, locked, llm, starting, onStart }: { a: Article; subBand: string; locked: boolean; llm: boolean; starting: boolean; onStart: () => void }) {
  return (
    <article className="group flex flex-col rounded-lg border border-line bg-card p-5 transition-[border-color,box-shadow] duration-200 ease-lf hover:border-line-strong hover:shadow-lift">
      <div className="flex items-center gap-2 text-[12px] text-ink-3">
        <span className="font-medium text-ink-2">{a.source}</span>
        <span aria-hidden>·</span>
        <span className="num">{a.publishedAt ? timeAgo(a.publishedAt) : "undated"}</span>
        <a href={a.url} target="_blank" rel="noreferrer" aria-label={`Open original on ${a.source}`} className="ml-auto rounded p-0.5 hover:text-ink">
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="capitalize">{a.topic}</Badge>
        <Badge variant={a.match === "i+1 match" ? "accent" : a.match === "too hard" ? "moderate" : "neutral"}>{tierLabel(subBand, a)}</Badge>
      </div>
      <h3 className="mt-3 font-serif text-[21px] font-medium leading-[1.25] tracking-[-0.01em] text-ink">{a.title}</h3>
      <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{a.preview}</p>
      <div className="mt-auto flex items-center gap-3 pt-5 text-[12px] text-ink-3">
        <span className="num flex items-center gap-1"><Clock className="size-3.5" aria-hidden />~{a.estMinutes} min</span>
        <span className="num" title="Text difficulty on the 0–100 level scale">D {a.difficulty.toFixed(0)}</span>
        <span className="num">{a.match}</span>
        <span className="ml-auto">
          {locked ? (
            <span className="flex items-center gap-1 text-ink-3" title="Clear the Error Detox to unlock new lessons"><Lock className="size-3.5" aria-hidden />Locked</span>
          ) : (
            <Button size="sm" variant="ink" onClick={onStart} disabled={!llm || starting} title={!llm ? "Add an LLM API key in .env to synthesize lessons" : undefined}>
              {starting ? "Synthesizing…" : "Start"}
            </Button>
          )}
        </span>
      </div>
    </article>
  );
}

function InProgressCard({ l }: { l: LessonRow }) {
  const n = STAGE_NUM[l.stage] ?? 1;
  return (
    <Link href={`/lesson/${l.id}`} className="group flex flex-col rounded-lg border border-line bg-card p-5 transition-[border-color,box-shadow] duration-200 ease-lf hover:border-line-strong hover:shadow-lift">
      <div className="flex items-center gap-2 text-[12px] text-ink-3">
        <span className="font-medium text-ink-2">{l.source}</span>
        <span aria-hidden>·</span>
        <span className="num">{l.chunkCount} chunks</span>
        <Badge variant="accent" className="ml-auto">In progress</Badge>
      </div>
      <h3 className="mt-3 font-serif text-[21px] font-medium leading-[1.25] tracking-[-0.01em] text-ink">{l.title}</h3>
      <div className="mt-auto pt-5">
        <div className="mb-1.5 flex items-center justify-between text-[12px]">
          <span className="num text-ink-2">Stage {n}/4</span>
          <span className="flex items-center gap-1 font-medium text-ink group-hover:text-accent">Resume <ArrowRight className="size-3.5" aria-hidden /></span>
        </div>
        <div className="flex gap-1" aria-hidden>
          {[1, 2, 3, 4].map((s) => (
            <span key={s} className={cn("h-1 flex-1 rounded-full", s < n ? "bg-accent" : s === n ? "bg-accent/40" : "bg-surface")} />
          ))}
        </div>
      </div>
    </Link>
  );
}

export function DashboardView() {
  const router = useRouter();
  const { sync, syncing, refresh } = useShell();
  const [data, setData] = useState<Dashboard | null>(null);
  const [lessons, setLessons] = useState<LessonsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<DashboardResponse>("/api/dashboard");
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
  useCrossDeviceSync(load);

  async function start(articleId: string) {
    setStarting(articleId);
    setError(null);
    try {
      const r = await api<{ lessonId: string }>("/api/lessons/synthesize", { articleId });
      await refresh();
      router.push(`/lesson/${r.lessonId}`);
    } catch (e) {
      setError(errorMessage(e));
      setStarting(null);
    }
  }

  if (error && !data) return <EmptyState title="Today's briefing could not load" body={error} action={<Button onClick={() => void load()}>Retry</Button>} />;
  if (!data) return <TodaySkeleton />;

  const t = data.telemetry;
  const acc = data.accountability;
  const inProgress = lessons?.lessons.filter((l) => l.stage !== "COMPLETED") ?? [];
  const fresh = lessons?.articles ?? [];
  const visible = showAll ? fresh : fresh.slice(0, Math.max(0, 3 - inProgress.length));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning briefing" : hour < 18 ? "Afternoon briefing" : "Evening briefing";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="mt-1 font-serif text-[30px] font-medium leading-tight tracking-[-0.015em]">{greeting}</h1>
        </div>
        {lessons && (
          <p className="text-[12.5px] tabular-nums text-ink-3">
            Level {lessons.level.toFixed(1)} → i+1 target {lessons.target.toFixed(1)}
          </p>
        )}
      </header>

      {!data.llm && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card p-4 text-[13.5px]">
          <KeyRound className="size-4 text-moderate-ink" aria-hidden />
          <span className="flex-1 text-ink-2">No LLM key is configured. Grading, lesson synthesis and the explainer stay off until you add one.</span>
          <Link href="/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>Open settings</Link>
        </div>
      )}

      {/* A — Accountability gate */}
      {acc.locked && (
        <section aria-labelledby="gate-title" className="animate-in flex flex-col gap-4 rounded-lg border border-line border-l-[3px] border-l-critical bg-card p-5 md:flex-row md:items-center">
          <ShieldAlert className="hidden size-5 shrink-0 text-critical md:block" aria-hidden />
          <div className="flex-1">
            <h2 id="gate-title" className="text-[15px] font-semibold">New lessons are locked until your error debt is cleared.</h2>
            <p className="mt-1 text-[13.5px] tabular-nums text-ink-2">
              {[acc.overdueCards > 0 ? `${acc.overdueCards} overdue chunk${acc.overdueCards === 1 ? "" : "s"}` : null, ...acc.top.slice(0, 2).map((p) => `Recurring flaw: ${humanize(p.subtype)} (${p.count}×)`)].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-[12.5px] text-ink-3">{acc.reasons.join(" ")}</p>
          </div>
          <Link href="/graveyard?tab=detox" className={buttonVariants({ variant: "danger", size: "md" })}>Start 5-Min Error Detox</Link>
        </section>
      )}

      {/* B — Telemetry & promotion lock strip */}
      <section aria-label="Proficiency telemetry" className="grid overflow-hidden rounded-lg border border-line bg-line md:grid-cols-[1fr_1.4fr_auto] [&>*]:min-w-0" style={{ gap: 1 }}>
        <div className="bg-card p-5">
          <p className="eyebrow">Current level</p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="num text-[34px] font-semibold leading-none tracking-tight">{t.subBand}</span>
            <span className="num text-[15px] text-ink-2">IELTS ≈ {t.ielts.band.toFixed(1)}</span>
          </div>
          <p className="mt-1 text-[12px] tabular-nums text-ink-3">range {t.ielts.low.toFixed(1)}–{t.ielts.high.toFixed(1)} · est. diagnostic equivalent</p>
          <div className="mt-3 text-[13px]">
            {t.decaying ? (
              <span className="flex items-center gap-1 text-moderate-ink"><ArrowDownRight className="size-4" aria-hidden />Decay applied — {data.ledger.decayedDays} idle day(s) beyond grace</span>
            ) : t.weekDelta ? (
              <span className={cn("flex items-center gap-1 font-medium tabular-nums", t.weekDelta.gai >= 0 ? "text-mastered-ink" : "text-critical-ink")}>
                {t.weekDelta.gai >= 0 ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownRight className="size-4" aria-hidden />}
                {signed(t.weekDelta.gai)} GAI this week · level {signed(t.weekDelta.level)}
              </span>
            ) : (
              <span className="text-ink-3">Trend appears after your next session.</span>
            )}
          </div>
        </div>
        <div className="bg-card p-5">
          <p className="eyebrow mb-3">Promotion lock → {t.nextBand ?? "top band"}</p>
          <PromotionLockList checks={t.checks} compact />
        </div>
        <div className="flex flex-col justify-center gap-2 bg-card p-5 md:w-56">
          <PromotionAction unlocked={t.promotion.unlocked} nextBand={t.nextBand} />
        </div>
      </section>

      {/* C — Live briefings */}
      <section aria-labelledby="brief-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="brief-title" className="text-[15px] font-semibold">Today&apos;s live briefings</h2>
            <p className="text-[12.5px] text-ink-3">Real articles from the last 72 hours, ranked by distance to your i+1 target.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw className={cn(syncing && "animate-spin")} aria-hidden />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
        {error && <p className="mb-3 rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}
        {!lessons ? (
          <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}</div>
        ) : fresh.length === 0 && inProgress.length === 0 ? (
          <EmptyState
            icon={<Newspaper />}
            title="No live articles yet"
            body="Pull today's articles from BBC, The Guardian, NPR, Aeon, TechCrunch, The Verge and Quanta. Each is profiled for difficulty and matched to your level."
            action={<Button onClick={() => void sync()} disabled={syncing}>{syncing ? "Syncing…" : "Sync live content"}</Button>}
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
              {inProgress.slice(0, 3).map((l) => <InProgressCard key={l.id} l={l} />)}
              {visible.map((a) => (
                <BriefingCard key={a.id} a={a} subBand={t.subBand} locked={acc.locked} llm={!!data.llm} starting={starting === a.id} onStart={() => void start(a.id)} />
              ))}
            </div>
            {!showAll && fresh.length > visible.length && (
              <button type="button" onClick={() => setShowAll(true)} className="mt-4 text-[13px] font-medium text-ink-2 hover:text-ink">
                Show {fresh.length - visible.length} more briefing{fresh.length - visible.length === 1 ? "" : "s"} →
              </button>
            )}
          </>
        )}
      </section>

      {data.arsenal.length > 0 && (
        <section aria-labelledby="arsenal-title" className="rounded-lg border border-line bg-card p-5">
          <h2 id="arsenal-title" className="text-[15px] font-semibold">Today&apos;s acquired arsenal</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.arsenal.map((a) => (
              <li key={a.phrase + a.sentence} className="border-l-2 border-mastered pl-3">
                <p className="font-medium">{a.phrase}</p>
                <p className="font-serif text-[14.5px] text-ink-2">{a.sentence}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

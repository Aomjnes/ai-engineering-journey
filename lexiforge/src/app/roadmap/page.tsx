"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Lock, MapPin } from "lucide-react";
import type { roadmapView } from "@/lib/roadmap/service";
import { api } from "@/lib/client/api";
import { bandName, bandShort, fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/lf/states";
import { MetricInfo, type MetricKey } from "@/components/lf/metric-tooltip";
import { usePrefs } from "@/components/lf/prefs";
import { useCrossDeviceSync } from "@/components/lf/shell-data";

type RoadmapResponse = Awaited<ReturnType<typeof roadmapView>>;
type Roadmap = Extract<RoadmapResponse, { ready: true }>;
type Milestone = Roadmap["milestones"][number];

const GOALS = [
  { value: "A2_2", key: "goalA2" },
  { value: "B1_2", key: "goalB1" },
  { value: "B2_2", key: "goalB2" },
  { value: "C1_1", key: "goalC1" },
] as const;
const MINUTES = [15, 30, 45, 60];

function UnlockBar({ label, metric, current, required }: { label: string; metric?: MetricKey; current: number | null; required: number }) {
  const { t } = usePrefs();
  const pct = current === null ? 0 : Math.min(100, (current / Math.max(required, 1)) * 100);
  const pass = current !== null && current >= required;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12.5px]">
        <span className="font-medium text-ink">{label}</span>
        {metric && <MetricInfo metric={metric} />}
        <span className={cn("num ml-auto", pass ? "text-mastered-ink" : "text-ink-3")}>{current === null ? t.common.noEvidence : `${current.toFixed(0)} / ${required}`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className={cn("h-full rounded-full transition-[width] duration-500 ease-lf", pass ? "bg-mastered" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-[12.5px]", ok ? "text-mastered-ink" : "text-ink-3")}>
      {ok ? <Check className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />} {label}
    </p>
  );
}

const PRACTICE_HREF: Record<string, string> = { DICTATION: "/practice?mode=DICTATION", SPEAKING: "/practice?mode=SPEAKING", SENTENCE: "/practice?mode=SENTENCE", ROLEPLAY: "/practice?mode=ROLEPLAY", FOUNDATION: "/practice?mode=FOUNDATION" };

function MilestoneCard({ m, lessonHref }: { m: Milestone; lessonHref: string }) {
  const { t, lang, pick } = usePrefs();
  const topics = lang === "vi" ? m.topics.vi : m.topics.en;
  const active = m.status === "ACTIVE";
  return (
    <li className="relative pl-10">
      <span className={cn("absolute left-0 top-5 flex size-7 items-center justify-center rounded-full border-2", m.status === "COMPLETED" ? "border-mastered bg-mastered text-white" : active ? "border-accent bg-card text-accent" : "border-line-strong bg-card text-ink-3")} aria-hidden>
        {m.status === "COMPLETED" ? <Check className="size-3.5" /> : active ? <MapPin className="size-3.5" /> : <Lock className="size-3" />}
      </span>
      <article className={cn("rounded-lg border bg-card p-5", active ? "border-accent/50 shadow-lift" : "border-line", m.status === "LOCKED" && "opacity-80")}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="num rounded bg-surface px-1.5 py-0.5 font-semibold text-ink">{bandShort(m.fromBand)} → {bandShort(m.toBand)}</span>
          <span className={cn("rounded px-1.5 py-0.5 font-semibold", m.status === "COMPLETED" ? "bg-mastered-wash text-mastered-ink" : active ? "bg-accent/10 text-accent-ink" : "bg-surface text-ink-3")}>
            {t.roadmap[`status${m.status}`]}
          </span>
          <span className="num ml-auto text-ink-3">{fmt(t.roadmap.hours, { n: m.estimatedHours })}</span>
        </div>
        <h3 className="mt-2.5 font-serif text-[21px] font-medium leading-snug">{pick(m.titleEn, m.titleVi)}</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-3">{bandName(t, m.toBand)}</p>
        <div className="mt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{t.roadmap.outcome}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{pick(m.outcomeEn, m.outcomeVi)}</p>
        </div>
        {m.status === "COMPLETED" && m.completedAt && <p className="mt-2 text-[12px] text-mastered-ink">{fmt(t.roadmap.completedOn, { date: new Date(m.completedAt).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB") })}</p>}
        {m.status !== "COMPLETED" && (
          <details className="mt-4 group" open={active}>
            <summary className="cursor-pointer list-none text-[13px] font-medium text-ink-2 hover:text-ink">{t.roadmap.skills} ▾</summary>
            <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
              <div><dt className="font-medium text-ink">{t.roadmap.pronunciation}</dt><dd className="mt-0.5 text-ink-2">{topics.pronunciation.join(" · ")}</dd></div>
              <div><dt className="font-medium text-ink">{t.roadmap.grammar}</dt><dd className="mt-0.5 text-ink-2">{topics.grammar.join(" · ")}</dd></div>
              <div><dt className="font-medium text-ink">{t.roadmap.chunks}</dt><dd className="mt-0.5 font-serif text-[14px] text-ink-2">{topics.chunks.join(" · ")}</dd></div>
              <div><dt className="font-medium text-ink">{t.roadmap.reading}</dt><dd className="mt-0.5 text-ink-2">{topics.reading}</dd></div>
            </dl>
          </details>
        )}
        {active && m.unlock && (
          <div className="mt-5 space-y-3 rounded-md border border-line bg-canvas p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{t.roadmap.unlock}</p>
            <UnlockBar label="GAI" metric="gai" current={m.unlock.gai.hasEvidence ? m.unlock.gai.current : null} required={m.unlock.gai.required} />
            <UnlockBar label="LRI" metric="lri" current={m.unlock.lri.hasEvidence ? m.unlock.lri.current : null} required={m.unlock.lri.required} />
            <UnlockBar label="RSS" metric="rss" current={m.unlock.rss.current} required={m.unlock.rss.required} />
            <UnlockBar label={t.roadmap.sessions} current={m.unlock.sessions.current} required={m.unlock.sessions.required} />
            <Flag ok={m.unlock.detoxClear} label={t.roadmap.detox} />
            <Flag ok={m.unlock.auditUnlocked} label={t.roadmap.audit} />
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={lessonHref} className={buttonVariants({ variant: "ink", size: "sm" })}>{t.roadmap.todayLesson}</Link>
              {topics.practice.map((p) => (
                <Link key={p} href={PRACTICE_HREF[p] ?? "/practice"} className={buttonVariants({ variant: "outline", size: "sm" })}>{t.practiceMode[p]}</Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </li>
  );
}

function GoalEditor({ r, onSaved }: { r: Roadmap; onSaved: (r: Roadmap) => void }) {
  const { t, err } = usePrefs();
  const [target, setTarget] = useState<string>(r.goal.targetSubBand);
  const [minutes, setMinutes] = useState(r.goal.dailyMinutes);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const next = await api<RoadmapResponse>("/api/roadmap", undefined, { method: "PUT", body: { targetSubBand: target, dailyMinutes: minutes } });
      if (next.ready) onSaved(next);
      setMsg(t.common.saved);
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="rounded-lg border border-line bg-card">
      <summary className="cursor-pointer list-none px-5 py-4 text-[14px] font-medium">{t.roadmap.adjust}</summary>
      <div className="space-y-4 border-t border-line p-5">
        <fieldset>
          <legend className="text-[13px] font-semibold">{t.roadmap.targetLabel}</legend>
          <div className="mt-2 grid gap-2">
            {GOALS.map((g) => (
              <label key={g.value} className={cn("flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-[13.5px]", target === g.value ? "border-ink/40" : "border-line")}>
                <input type="radio" name="goal" checked={target === g.value} onChange={() => setTarget(g.value)} className="accent-[rgb(var(--accent))]" />
                {t.onboarding[g.key]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[13px] font-semibold">{t.roadmap.minutesLabel}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {MINUTES.map((m) => (
              <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={cn("num rounded-md border px-3 py-1.5 text-[13px]", minutes === m ? "border-ink/40 font-semibold" : "border-line text-ink-2")}>{fmt(t.onboarding.minutesOpt, { n: m })}</button>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={busy}>{t.roadmap.saveGoal}</Button>
          {msg && <span role="status" className="text-[12.5px] text-ink-3">{msg}</span>}
        </div>
      </div>
    </details>
  );
}

export default function RoadmapPage() {
  const { t, err } = usePrefs();
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<RoadmapResponse>("/api/roadmap"));
    } catch (e) {
      setError(err(e));
    }
  }, [err]);
  useEffect(() => {
    void load();
  }, [load]);
  useCrossDeviceSync(load);

  if (error && !data) return <EmptyState title={t.roadmap.title} body={error} action={<Button onClick={() => void load()}>{t.common.retry}</Button>} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  if (!data.ready) return <EmptyState title={t.roadmap.title} body={t.roadmap.notReady} action={<Link href="/onboarding" className={buttonVariants({ variant: "primary" })}>{t.roadmap.goToTest}</Link>} />;

  const r = data;
  const cta = r.next.href;
  const lessonHref = r.next.kind === "RESUME_LESSON" ? r.next.href : "/";
  const v = Math.round((r.velocity - 1) * 100);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="eyebrow">{t.roadmap.eyebrow}</p>
        <h1 className="mt-1 font-serif text-[30px] font-medium leading-tight tracking-[-0.015em]">{t.roadmap.title}</h1>
      </header>

      <section className="rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="eyebrow">{t.roadmap.now}</p>
            <p className="num mt-1 text-[28px] font-semibold leading-none">{bandShort(r.current.subBand)}</p>
            <p className="mt-1 text-[12.5px] text-ink-3">{bandName(t, r.current.subBand)}</p>
          </div>
          <ArrowRight className="mb-6 size-5 text-ink-3" aria-hidden />
          <div>
            <p className="eyebrow">{t.roadmap.goal}</p>
            <p className="num mt-1 text-[28px] font-semibold leading-none">{bandShort(r.goal.targetSubBand)}</p>
            <p className="mt-1 text-[12.5px] text-ink-3">{bandName(t, r.goal.targetSubBand)}</p>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={r.progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={fmt(t.roadmap.progressLabel, { pct: r.progressPct.toFixed(0) })}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-lf" style={{ width: `${r.progressPct}%` }} />
        </div>
        <p className="mt-2 text-[12.5px] tabular-nums text-ink-3">{fmt(t.roadmap.progressLabel, { pct: r.progressPct.toFixed(0) })}</p>
        <p className="mt-3 text-[14px] tabular-nums text-ink-2">
          {r.reached ? t.roadmap.reached : fmt(t.roadmap.pace, { weeks: r.weeksLeft, minutes: r.goal.dailyMinutes, hours: Math.round(r.hoursLeft) })}
        </p>
        {!r.reached && Math.abs(v) >= 10 && <p className="mt-1 text-[13px] text-ink-3">{v > 0 ? fmt(t.roadmap.velocityFast, { pct: v }) : fmt(t.roadmap.velocitySlow, { pct: -v })}</p>}
        <Link href={cta} className={cn(buttonVariants({ variant: "primary", size: "lg" }), "mt-5 h-auto min-h-11 w-full whitespace-normal py-2.5 text-center sm:w-auto")}>
          {t.roadmap.next}: {t.roadmap[`next${r.next.kind}`]} <ArrowRight aria-hidden />
        </Link>
      </section>

      <GoalEditor r={r} onSaved={setData} />

      <ol className="relative space-y-4 before:absolute before:bottom-4 before:left-[13px] before:top-4 before:w-px before:bg-line">
        {r.milestones.map((m) => <MilestoneCard key={m.id} m={m} lessonHref={lessonHref} />)}
      </ol>
    </div>
  );
}

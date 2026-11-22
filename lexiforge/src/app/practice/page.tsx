"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookA, Ear, Languages, MessagesSquare, Mic } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, GENERATE_PHASES, PhasedStatus } from "@/components/lf/states";
import { usePrefs } from "@/components/lf/prefs";
import { DictationMode } from "@/components/practice/dictation";
import { SpeakingMode } from "@/components/practice/speaking";
import { SentenceMode } from "@/components/practice/sentence";
import { RoleplayMode } from "@/components/practice/roleplay";
import { FoundationMode, type DeckSummary } from "@/components/practice/foundation";
import type { Mode, Session } from "@/components/practice/shared";

interface Overview {
  level: string;
  beginner: boolean;
  recommended: string[];
  milestone: { titleVi: string; titleEn: string } | null;
  scenarios: Array<{ id: string; titleVi: string; titleEn: string; setupVi: string; setupEn: string }>;
  decks: DeckSummary[];
  recent: Array<{ id: string; mode: Mode; status: string; score: number | null; topic: string; createdAt: string }>;
}

const MODES: Array<{ mode: Mode; icon: React.ComponentType<{ className?: string }> }> = [
  { mode: "DICTATION", icon: Ear },
  { mode: "SPEAKING", icon: Mic },
  { mode: "SENTENCE", icon: Languages },
  { mode: "ROLEPLAY", icon: MessagesSquare },
  { mode: "FOUNDATION", icon: BookA },
];
const isMode = (v: string | null): v is Mode => !!v && MODES.some((m) => m.mode === v);

function Studio() {
  const { t, fmt, err, pick } = usePrefs();
  const router = useRouter();
  const params = useSearchParams();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modeParam = params.get("mode");
  const sessionParam = params.get("session");
  const mode: Mode | null = session?.mode ?? (isMode(modeParam) ? modeParam : null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api<Overview>("/api/practice"));
    } catch (e) {
      if (e instanceof ApiError && e.code === "CALIBRATION_REQUIRED") router.replace("/onboarding");
      else setError(err(e));
    }
  }, [err, router]);
  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    if (!sessionParam) {
      setSession(null);
      return;
    }
    if (session?.id === sessionParam) return;
    api<Session>(`/api/practice?session=${encodeURIComponent(sessionParam)}`).then(setSession, (e) => setError(err(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the URL only
  }, [sessionParam]);

  const go = (m: Mode | null) => {
    setSession(null);
    setError(null);
    router.push(m ? `/practice?mode=${m}` : "/practice");
  };

  async function start(m: Exclude<Mode, "FOUNDATION">, scenarioId?: string) {
    setBusy(true);
    setError(null);
    try {
      const s = await api<Session>("/api/practice", { action: "start", mode: m, scenarioId });
      setSession(s);
      router.replace(`/practice?mode=${m}&session=${s.id}`);
      void loadOverview();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  if (!overview && error) return <EmptyState title={t.practice.title} body={error} action={<Button onClick={() => void loadOverview()}>{t.common.retry}</Button>} />;
  if (!overview) return <div className="space-y-4"><Skeleton className="h-8 w-56" /><div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div></div>;

  const modeName = (m: Mode) => t.practiceMode[m];
  const desc = (m: Mode) => (t.practice as Record<string, string>)[`desc${m}`] ?? "";
  const again = () => {
    if (mode && mode !== "FOUNDATION" && mode !== "ROLEPLAY") void start(mode);
    else go(mode);
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">{t.practice.eyebrow}</p>
        <h1 className="mt-1 font-serif text-[30px] font-medium leading-tight tracking-[-0.015em]">{mode ? modeName(mode) : t.practice.title}</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-ink-2">{fmt(t.practice.sub, { level: overview.level })}</p>
        {mode && <button type="button" onClick={() => go(null)} className="mt-3 text-[13px] text-ink-3 hover:text-ink">{t.practice.back}</button>}
      </header>
      {error && <p role="alert" className="rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}

      {!mode && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MODES.map(({ mode: m, icon: Icon }) => (
              <button key={m} type="button" onClick={() => go(m)} className="group flex flex-col rounded-lg border border-line bg-card p-5 text-left transition-[border-color,box-shadow] duration-200 ease-lf hover:border-line-strong hover:shadow-lift">
                <div className="flex items-center gap-2">
                  <Icon className="size-5 text-accent" />
                  {overview.recommended.includes(m) && <Badge variant="accent" className="ml-auto">{t.practice.recommended}</Badge>}
                </div>
                <p className="mt-3 text-[16px] font-semibold">{modeName(m)}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{desc(m)}</p>
              </button>
            ))}
          </div>
          <section>
            <h2 className="text-[15px] font-semibold">{t.practice.recent}</h2>
            {overview.recent.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink-3">{t.practice.noRecent}</p>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-card">
                {overview.recent.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="font-medium">{modeName(r.mode)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-3">{r.topic}</span>
                    <span className="num text-ink-3">{r.status === "COMPLETED" ? `${t.practice.statusCOMPLETED}${r.score !== null ? ` · ${r.score.toFixed(0)}%` : ""}` : t.practice.statusIN_PROGRESS}</span>
                    {r.status !== "COMPLETED" && <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => router.push(`/practice?mode=${r.mode}&session=${r.id}`)}>{t.practice.resume}</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {mode === "FOUNDATION" && <FoundationMode decks={overview.decks} onChanged={() => void loadOverview()} />}

      {mode && mode !== "FOUNDATION" && !session && (
        <div className="rounded-lg border border-line bg-card p-5">
          <p className="text-[14px] text-ink-2">{desc(mode)}</p>
          {mode === "ROLEPLAY" ? (
            <div className="mt-4">
              <p className="text-[13px] font-semibold">{t.practice.scenarios}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {overview.scenarios.map((s) => (
                  <button key={s.id} type="button" disabled={busy} onClick={() => void start("ROLEPLAY", s.id)} className="rounded-md border border-line p-3 text-left hover:border-line-strong disabled:opacity-60">
                    <p className="text-[14px] font-medium">{pick(s.titleEn, s.titleVi)}</p>
                    <p className="text-[12.5px] text-ink-3">{pick(s.setupEn, s.setupVi)}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Button className="mt-4" onClick={() => void start(mode)} disabled={busy}>{busy ? t.practice.generating : t.practice.start}</Button>
          )}
          <PhasedStatus className="mt-4" phases={GENERATE_PHASES} active={busy} />
        </div>
      )}

      {session && (
        <div>
          <p className="mb-3 text-[12.5px] text-ink-3">{fmt(t.practice.topic, { topic: session.topic })}</p>
          {session.mode === "DICTATION" && <DictationMode key={session.id} session={session} onSession={setSession} onAgain={again} />}
          {session.mode === "SPEAKING" && <SpeakingMode key={session.id} session={session} onSession={setSession} onAgain={again} />}
          {session.mode === "SENTENCE" && <SentenceMode key={session.id} session={session} onSession={setSession} onAgain={again} />}
          {session.mode === "ROLEPLAY" && <RoleplayMode key={session.id} session={session} onSession={setSession} onAgain={again} />}
        </div>
      )}
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  );
}

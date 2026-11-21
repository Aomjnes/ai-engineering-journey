"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ExternalLink, Lock, X } from "lucide-react";
import type { lessonView } from "@/lib/lessons/flow";
import type { Explanation } from "@/lib/explain/service";
import { api, errorMessage } from "@/lib/client/api";
import { timeAgo } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { AudioShadowingBar } from "@/components/lf/audio-bar";
import { EXPLAIN_TABS, ModeExplainer, type ExplainState, type ExplainTab } from "@/components/lf/mode-explainer";
import { isTypingTarget } from "@/components/lf/app-shell";
import { usePrefs } from "@/components/lf/prefs";
import { useShell } from "@/components/lf/shell-data";
import { EmptyState } from "@/components/lf/states";
import { useTts } from "@/components/lesson/speech";
import { ReadingPane, sentencesOf, type ReadingChunk } from "@/components/lesson/reading-pane";
import { ShadowingCheck } from "@/components/lesson/shadowing";
import { ComprehensionStage } from "@/components/lesson/comprehension";
import { ProductionStage, type Attempt } from "@/components/lesson/production";
import { ArsenalReceipt, ExitTicketStage } from "@/components/lesson/exit-ticket";

type Lesson = Awaited<ReturnType<typeof lessonView>>;
type StageKey = "INPUT" | "COMPREHENSION" | "PRODUCTION" | "EXIT_TICKET" | "COMPLETED";

const STEPS: Array<{ key: Exclude<StageKey, "COMPLETED">; label: string }> = [
  { key: "INPUT", label: "Input & Dissect" },
  { key: "COMPREHENSION", label: "Comprehension" },
  { key: "PRODUCTION", label: "Produce & Repair" },
  { key: "EXIT_TICKET", label: "Exit Ticket" },
];
const ORDER: StageKey[] = ["INPUT", "COMPREHENSION", "PRODUCTION", "EXIT_TICKET", "COMPLETED"];

function Stepper({ stage, viewing, onView }: { stage: StageKey; viewing: StageKey; onView: (s: StageKey) => void }) {
  const current = ORDER.indexOf(stage);
  return (
    <nav aria-label="Lesson stages" className="sticky top-14 z-10 -mx-4 border-b border-line bg-canvas/92 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 md:-mx-8 md:px-8">
      <ol className="flex items-center gap-1 overflow-x-auto">
        {STEPS.map((s, i) => {
          const done = i < current;
          const locked = i > current;
          const isView = viewing === s.key || (viewing === "COMPLETED" && s.key === "EXIT_TICKET");
          return (
            <li key={s.key} className="flex shrink-0 items-center gap-1">
              {i > 0 && <span className={cn("h-px w-4 md:w-8", done || i <= current ? "bg-accent/50" : "bg-line")} aria-hidden />}
              <button
                type="button"
                disabled={locked}
                onClick={() => onView(stage === "COMPLETED" && s.key === "EXIT_TICKET" ? "COMPLETED" : s.key)}
                aria-current={isView ? "step" : undefined}
                title={locked ? "Locked until the previous stage passes" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-full px-2.5 text-[12.5px] font-medium transition-colors duration-200 ease-lf",
                  isView ? "bg-ink text-canvas" : done ? "text-ink-2 hover:bg-surface" : locked ? "text-ink-3" : "text-ink hover:bg-surface",
                )}
              >
                <span className={cn("num flex size-5 items-center justify-center rounded-full text-[10.5px] [&_svg]:size-3", isView ? "bg-canvas/20" : done ? "bg-mastered-wash text-mastered-ink" : "bg-surface")}>
                  {done ? <Check aria-label="completed" /> : locked ? <Lock aria-label="locked" /> : i + 1}
                </span>
                <span className={cn(!isView && "hidden sm:inline")}>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function LessonSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading lesson">
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="grid gap-8 lg:grid-cols-[62fr_38fr]">
        <div className="mx-auto w-full max-w-[65ch] space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className={cn("h-4", i % 3 === 2 ? "w-2/3" : "w-full")} />
          ))}
        </div>
        <Skeleton className="hidden h-96 lg:block" />
      </div>
    </div>
  );
}

function latestAttempt(l: Lesson): Attempt | null {
  const last = l.production[l.production.length - 1];
  if (!last) return null;
  return { text: last.text, blocked: !last.passedGate, reasons: last.reasons, errors: last.errors as Attempt["errors"], chunks: last.chunks, gai: last.gai, lri: last.lri, verdictEn: last.verdictEn, verdictVi: last.verdictVi, nativeUpgrade: last.nativeUpgrade, session: null };
}

export default function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { pick } = usePrefs();
  const { refresh: refreshShell } = useShell();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<StageKey | null>(null);
  const [holdProduction, setHoldProduction] = useState(false);
  const [version, setVersion] = useState<"guided" | "original" | "both">("guided");
  const [rate, setRate] = useState(1);
  const [explain, setExplain] = useState<ExplainState | null>(null);
  const [tab, setTab] = useState<ExplainTab>("logic");
  const [selectedSentence, setSelectedSentence] = useState<string | null>(null);
  const [activeChunk, setActiveChunk] = useState<string | null>(null);
  const cache = useRef(new Map<string, Explanation>());
  const tts = useTts();

  const load = useCallback(async () => {
    try {
      const l = await api<Lesson>(`/api/lessons/${id}`);
      setLesson(l);
      return l;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stage = (lesson?.stage ?? "INPUT") as StageKey;
  const view: StageKey = holdProduction ? "PRODUCTION" : (viewing ?? stage);
  const text = lesson ? (lesson.isGraded && version === "original" ? lesson.authenticExcerpt : lesson.readingText) : "";
  const sentences = useMemo(() => sentencesOf(text), [text]);
  const chunks: ReadingChunk[] = useMemo(() => lesson?.chunks.map((c) => ({ id: c.id, phrase: c.phrase })) ?? [], [lesson]);

  const openExplain = useCallback(async (selection: string, context: string) => {
    const sel = selection.trim().slice(0, 500);
    if (!sel) return;
    const cached = cache.current.get(sel);
    if (cached) {
      setExplain({ selection: sel, data: cached, loading: false, error: null });
      return;
    }
    setExplain({ selection: sel, data: null, loading: true, error: null });
    try {
      const data = await api<Explanation>("/api/explain", { selection: sel, context });
      cache.current.set(sel, data);
      setExplain((cur) => (cur?.selection === sel ? { selection: sel, data, loading: false, error: null } : cur));
    } catch (e) {
      setExplain((cur) => (cur?.selection === sel ? { selection: sel, data: null, loading: false, error: errorMessage(e) } : cur));
    }
  }, []);

  const closeInspector = useCallback(() => {
    setExplain(null);
    setSelectedSentence(null);
    setActiveChunk(null);
  }, []);

  const togglePlay = useCallback(() => {
    if (!tts.supported) return;
    if (tts.state === "playing") tts.pause();
    else if (tts.state === "paused") tts.resume();
    else tts.speak(sentences, rate, 0);
  }, [tts, sentences, rate]);

  // Keyboard: Space = play/pause, 1–4 = explainer modes, Esc = close inspector.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " && view === "INPUT") {
        e.preventDefault();
        togglePlay();
      } else if (explain && ["1", "2", "3", "4"].includes(e.key)) {
        const t = EXPLAIN_TABS[Number(e.key) - 1];
        if (t) setTab(t.key);
      } else if (e.key === "Escape" && explain) {
        closeInspector();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, explain, togglePlay, closeInspector]);

  useEffect(() => {
    if (view !== "INPUT") tts.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  if (error && !lesson) return <EmptyState title="This lesson could not load" body={error} action={<Link href="/" className="text-[13.5px] font-medium text-accent">Back to Today</Link>} />;
  if (!lesson) return <LessonSkeleton />;

  const after = async () => {
    await load();
    await refreshShell();
  };

  const inspectorIdle = (
    <div className="space-y-6">
      {stage === "INPUT" && (
        <ShadowingCheck
          lessonId={lesson.id}
          sentence={lesson.shadowSentence}
          ttsSupported={tts.supported}
          onPlay={() => lesson.shadowSentence && tts.speak([lesson.shadowSentence], rate, 0)}
          onPassed={async () => {
            await after();
            setViewing(null);
          }}
        />
      )}
      {stage !== "INPUT" && (
        <div className="rounded-lg border border-mastered/30 bg-mastered-wash/50 p-4 text-[13.5px] text-ink-2">
          Stage 1 passed. You are re-reading; your current stage is <button type="button" className="font-medium text-accent underline-offset-4 hover:underline" onClick={() => setViewing(null)}>{STEPS.find((s) => s.key === stage)?.label ?? "Completed"}</button>.
        </div>
      )}
      <section>
        <p className="eyebrow mb-2.5">Today&apos;s target chunks</p>
        <ul className="space-y-1">
          {lesson.chunks.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveChunk(c.id);
                  setSelectedSentence(null);
                  void openExplain(c.phrase, c.sourceSentence);
                }}
                className="group w-full rounded-md px-2 py-1.5 text-left hover:bg-surface"
              >
                <span className="flex items-baseline gap-2">
                  <span className="chunk-mark font-serif text-[16px] text-ink" data-active={activeChunk === c.id}>{c.phrase}</span>
                  {c.isStretch && <Badge variant="moderate">stretch</Badge>}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-ink-3">{pick(c.meaningEn, c.meaningVi)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {lesson.grammarInWild.length > 0 && (
        <section>
          <p className="eyebrow mb-2.5">Grammar in the wild</p>
          <div className="space-y-3">
            {lesson.grammarInWild.map((g) => (
              <div key={g.pattern} className="rounded-md border-l-2 border-accent/60 bg-card py-2 pl-3 pr-2">
                <p className="text-[13px] font-semibold text-ink">{g.pattern}</p>
                <p className="mt-1 font-serif text-[15px] italic leading-relaxed text-ink-2">{g.example}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{pick(g.explanationEn, g.explanationVi)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" aria-hidden />Today</Link>
        <span className="truncate text-[12.5px] text-ink-3">{lesson.article.source} · {lesson.article.title}</span>
      </div>
      <Stepper stage={stage} viewing={view} onView={(s) => { setHoldProduction(false); setViewing(s === stage ? null : s); }} />

      {view === "INPUT" && (
        <div className="mt-6 grid gap-8 lg:grid-cols-[62fr_38fr] [&>*]:min-w-0">
          <article className="relative">
            <header className="measure mx-auto">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                <span className="font-medium text-ink-2">{lesson.article.source}</span>
                <span aria-hidden>·</span>
                <span className="num">{lesson.article.publishedAt ? timeAgo(lesson.article.publishedAt) : "undated"}</span>
                <a href={lesson.article.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-ink">source <ExternalLink className="size-3" aria-hidden /></a>
              </div>
              <h1 className="mt-3 font-serif text-[32px] font-medium leading-[1.15] tracking-[-0.015em] text-ink md:text-[38px]">{lesson.article.title}</h1>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="accent">{lesson.isGraded ? "Guided i+1 bridge" : `Authentic ${lesson.article.cefrTier}`}</Badge>
                <Badge variant="outline" className="num">D {lesson.difficulty.toFixed(0)}</Badge>
                <Badge variant="outline" className="num">~{Math.round(lesson.comprehensibility * 100)}% familiar</Badge>
              </div>
              {lesson.isGraded && (
                <Segmented
                  className="mt-5"
                  label="Text version"
                  value={version}
                  onChange={(v) => { tts.stop(); setVersion(v); }}
                  options={[
                    { value: "guided", label: "Guided i+1 Version" },
                    { value: "original", label: "Original Live Source" },
                    { value: "both", label: <span className="hidden xl:inline">Side by side</span>, hint: "Wide screens only" },
                  ].filter((o) => o.value !== "both" || (typeof window !== "undefined" && window.innerWidth >= 1280)) as Array<{ value: "guided" | "original" | "both"; label: React.ReactNode }>}
                />
              )}
              <p className="mt-5 text-[12.5px] text-ink-3">Click any sentence or underlined chunk — or select any phrase — to dissect it.</p>
            </header>
            {version === "both" && lesson.isGraded ? (
              <div className="mt-6 grid grid-cols-2 gap-6">
                <div>
                  <p className="eyebrow mb-2">Guided</p>
                  <ReadingPane text={lesson.readingText} chunks={chunks} selected={selectedSentence} speakingIndex={null} activeChunk={activeChunk} className="!text-[16.5px]" onSentence={(s, p) => { setSelectedSentence(s); setActiveChunk(null); void openExplain(s, p); }} onChunk={(c, s) => { setActiveChunk(c.id); setSelectedSentence(null); void openExplain(c.phrase, s); }} onSelection={(sel, p) => void openExplain(sel, p)} />
                </div>
                <div>
                  <p className="eyebrow mb-2">Original</p>
                  <ReadingPane text={lesson.authenticExcerpt} chunks={chunks} selected={selectedSentence} speakingIndex={null} activeChunk={activeChunk} className="!text-[16.5px]" onSentence={(s, p) => { setSelectedSentence(s); setActiveChunk(null); void openExplain(s, p); }} onChunk={(c, s) => { setActiveChunk(c.id); setSelectedSentence(null); void openExplain(c.phrase, s); }} onSelection={(sel, p) => void openExplain(sel, p)} />
                </div>
              </div>
            ) : (
              <ReadingPane
                className="mx-auto mt-6"
                text={text}
                chunks={chunks}
                selected={selectedSentence}
                speakingIndex={tts.speakingIndex}
                activeChunk={activeChunk}
                onSentence={(s, p) => { setSelectedSentence(s); setActiveChunk(null); void openExplain(s, p); }}
                onChunk={(c, s) => { setActiveChunk(c.id); setSelectedSentence(null); void openExplain(c.phrase, s); }}
                onSelection={(sel, p) => void openExplain(sel, p)}
              />
            )}
            {tts.supported && version !== "both" && (
              <div className="pointer-events-none sticky bottom-20 z-10 mt-6 flex justify-center md:bottom-6">
                <AudioShadowingBar
                  state={tts.state}
                  rate={rate}
                  position={tts.speakingIndex}
                  total={sentences.length}
                  onToggle={togglePlay}
                  onStop={tts.stop}
                  onBack={() => tts.speak(sentences, rate, Math.max(0, (tts.speakingIndex ?? 0) - 1))}
                  onRate={(r) => {
                    setRate(r);
                    if (tts.state === "playing") tts.speak(sentences, r, tts.speakingIndex ?? 0);
                  }}
                />
              </div>
            )}
          </article>

          {/* Inspector: sticky panel on desktop; idle content inline + bottom sheet on mobile/tablet */}
          <aside aria-label="Inspector" className="lg:sticky lg:top-[7.75rem] lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto">
            <div className="hidden lg:block">
              {explain ? (
                <div className="animate-in rounded-lg border border-line bg-card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="eyebrow">Dissection</p>
                    <button type="button" onClick={closeInspector} aria-label="Close inspector (Esc)" className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink"><X className="size-4" /></button>
                  </div>
                  <ModeExplainer state={explain} tab={tab} onTab={setTab} />
                </div>
              ) : (
                inspectorIdle
              )}
            </div>
            <div className="lg:hidden">{inspectorIdle}</div>
          </aside>
          {explain && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Dissection">
              <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/25" onClick={closeInspector} />
              <div className="animate-in absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-sheet">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
                <div className="mb-2 flex justify-end">
                  <button type="button" onClick={closeInspector} aria-label="Close" className="rounded p-1 text-ink-3 hover:bg-surface"><X className="size-4" /></button>
                </div>
                <ModeExplainer state={explain} tab={tab} onTab={setTab} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        {view === "COMPREHENSION" && <ComprehensionStage lessonId={lesson.id} questions={lesson.questions} source={lesson.readingText} title={lesson.article.title} onChange={after} />}
        {view === "PRODUCTION" && (
          <ProductionStage
            key={lesson.production.length}
            lessonId={lesson.id}
            prompt={lesson.productionPrompt}
            chunks={lesson.chunks.map((c) => c.phrase)}
            source={lesson.readingText}
            title={lesson.article.title}
            initial={holdProduction ? null : latestAttempt(lesson)}
            onPassed={async () => {
              setHoldProduction(true);
              await refreshShell();
            }}
            onContinue={() => {
              setHoldProduction(false);
              setViewing(null);
              void load();
            }}
          />
        )}
        {view === "EXIT_TICKET" && <ExitTicketStage lessonId={lesson.id} chunks={lesson.chunks} onChange={after} />}
        {view === "COMPLETED" && (lesson.receipt ? <ArsenalReceipt receipt={lesson.receipt} /> : <EmptyState title="Lesson completed" body="All chunks are locked into your review deck." />)}
      </div>
    </div>
  );
}

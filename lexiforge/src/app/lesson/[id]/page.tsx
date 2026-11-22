"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ExternalLink, Lock, X } from "lucide-react";
import type { lessonView } from "@/lib/lessons/flow";
import type { Explanation } from "@/lib/explain/service";
import { api } from "@/lib/client/api";
import { fmt, timeAgoIn, type Dict } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { AudioShadowingBar } from "@/components/lf/audio-bar";
import { EXPLAIN_TABS, ModeExplainer, type ExplainState, type ExplainTab } from "@/components/lf/mode-explainer";
import { isTypingTarget } from "@/components/lf/app-shell";
import { usePrefs } from "@/components/lf/prefs";
import { useCrossDeviceSync, useShell } from "@/components/lf/shell-data";
import { EmptyState } from "@/components/lf/states";
import { useTts } from "@/components/lesson/speech";
import { ReadingPane, sentencesOf, type ReadingChunk } from "@/components/lesson/reading-pane";
import { ShadowingCheck } from "@/components/lesson/shadowing";
import { ComprehensionStage } from "@/components/lesson/comprehension";
import { ProductionStage, type Attempt } from "@/components/lesson/production";
import { ArsenalReceipt, ExitTicketStage } from "@/components/lesson/exit-ticket";

type Lesson = Awaited<ReturnType<typeof lessonView>>;
type StageKey = "INPUT" | "COMPREHENSION" | "PRODUCTION" | "EXIT_TICKET" | "COMPLETED";

const stepsOf = (t: Dict): Array<{ key: Exclude<StageKey, "COMPLETED">; label: string }> => [
  { key: "INPUT", label: t.stage.step1 },
  { key: "COMPREHENSION", label: t.stage.step2 },
  { key: "PRODUCTION", label: t.stage.step3 },
  { key: "EXIT_TICKET", label: t.stage.step4 },
];

/** Micro-story vocabulary: tap a word to reveal its Vietnamese meaning. */
function GlossPanel({ glosses }: { glosses: Array<{ text: string; vi: string }> }) {
  const { t } = usePrefs();
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (glosses.length === 0) return null;
  return (
    <section className="measure mx-auto mt-6 rounded-lg border border-line bg-card p-4">
      <p className="eyebrow mb-2">{t.stage.glossTitle}</p>
      <ul className="flex flex-wrap gap-1.5">
        {glosses.map((g) => {
          const shown = open.has(g.text);
          return (
            <li key={g.text}>
              <button
                type="button"
                aria-expanded={shown}
                onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(g.text)) n.delete(g.text); else n.add(g.text); return n; })}
                className={cn("rounded-full border px-3 py-1 text-[14px] transition-colors", shown ? "border-accent/50 bg-accent-wash text-ink" : "border-line bg-canvas text-ink hover:border-line-strong")}
              >
                <span className="font-serif">{g.text}</span>
                {shown && <span className="ml-1.5 text-[13px] text-ink-2">= {g.vi}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
const ORDER: StageKey[] = ["INPUT", "COMPREHENSION", "PRODUCTION", "EXIT_TICKET", "COMPLETED"];

function Stepper({ stage, viewing, onView }: { stage: StageKey; viewing: StageKey; onView: (s: StageKey) => void }) {
  const { t } = usePrefs();
  const STEPS = stepsOf(t);
  const current = ORDER.indexOf(stage);
  return (
    <nav aria-label={t.stage.stagesNav} className="sticky top-14 z-10 -mx-4 border-b border-line bg-canvas/92 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 md:-mx-8 md:px-8">
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
                title={locked ? t.stage.lockedPrev : undefined}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-full px-2.5 text-[12.5px] font-medium transition-colors duration-200 ease-lf",
                  isView ? "bg-ink text-canvas" : done ? "text-ink-2 hover:bg-surface" : locked ? "text-ink-3" : "text-ink hover:bg-surface",
                )}
              >
                <span className={cn("num flex size-5 items-center justify-center rounded-full text-[10.5px] [&_svg]:size-3", isView ? "bg-canvas/20" : done ? "bg-mastered-wash text-mastered-ink" : "bg-surface")}>
                  {done ? <Check aria-label={t.stage.completed} /> : locked ? <Lock aria-label={t.stage.locked} /> : i + 1}
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
  const { t } = usePrefs();
  return (
    <div className="space-y-6" aria-label={t.stage.loading}>
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
  const { pick, t, err, lang } = usePrefs();
  const { refresh: refreshShell, status: shell } = useShell();
  const STEPS = stepsOf(t);
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
      setError(err(e));
      return null;
    }
  }, [id, err]);
  const micro = lesson?.deliveryMode === "MICRO_STORY";
  // Beginner micro stories are read slower by default (0.8×).
  useEffect(() => {
    if (micro) setRate(0.8);
  }, [micro]);

  useEffect(() => {
    void load();
  }, [load]);
  // Another device may have advanced this lesson; never pull while a production result is on screen.
  useCrossDeviceSync(() => {
    if (!holdProduction) void load();
  });

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
      setExplain((cur) => (cur?.selection === sel ? { selection: sel, data: null, loading: false, error: err(e) } : cur));
    }
  }, [err]);

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
        const k = EXPLAIN_TABS[Number(e.key) - 1];
        if (k) setTab(k.key);
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

  if (error && !lesson) return <EmptyState title={t.stage.loadFailed} body={error} action={<Link href="/" className="text-[13.5px] font-medium text-accent">{t.exit.backToday}</Link>} />;
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
          {t.stage.passedReread} <button type="button" className="font-medium text-accent underline-offset-4 hover:underline" onClick={() => setViewing(null)}>{STEPS.find((s) => s.key === stage)?.label ?? t.stage.completedLabel}</button>.
        </div>
      )}
      <section>
        <p className="eyebrow mb-2.5">{t.stage.targetChunks}</p>
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
                  {c.isStretch && <Badge variant="moderate">{t.stage.stretch}</Badge>}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-ink-3">{pick(c.meaningEn, c.meaningVi)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {lesson.grammarInWild.length > 0 && (
        <section>
          <p className="eyebrow mb-2.5">{t.stage.grammarWild}</p>
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
        <Link href="/" className="flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" aria-hidden />{t.stage.backToday}</Link>
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
                <span className="num">{lesson.article.publishedAt ? (micro ? new Date(lesson.article.publishedAt).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB") : timeAgoIn(t, lesson.article.publishedAt)) : t.common.undated}</span>
                <a href={lesson.article.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-ink">{t.common.source} <ExternalLink className="size-3" aria-hidden /></a>
              </div>
              {micro && <p className="eyebrow mt-3">{t.stage.originalHeadline}</p>}
              <h1 className={cn("font-serif font-medium leading-[1.15] tracking-[-0.015em] text-ink", micro ? "mt-1 text-[24px] md:text-[28px]" : "mt-3 text-[32px] md:text-[38px]")}>{lesson.article.title}</h1>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="accent">{micro ? t.stage.badgeMicro : lesson.isGraded ? t.stage.badgeBridge : fmt(t.stage.badgeAuthentic, { tier: lesson.article.cefrTier })}</Badge>
                {micro && <Badge variant="outline">{fmt(t.stage.sourceBadge, { source: lesson.article.source, date: lesson.article.publishedAt ? new Date(lesson.article.publishedAt).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB") : t.common.undated })}</Badge>}
                <Badge variant="outline" className="num">{fmt(t.stage.difficulty, { n: lesson.difficulty.toFixed(0) })}</Badge>
                <Badge variant="outline" className="num">{fmt(t.stage.familiar, { n: Math.round(lesson.comprehensibility * 100) })}</Badge>
              </div>
              {lesson.isGraded && (
                <Segmented
                  className="mt-5"
                  label={t.stage.textVersion}
                  value={version}
                  onChange={(v) => { tts.stop(); setVersion(v); }}
                  options={[
                    { value: "guided", label: t.stage.guidedVersion },
                    { value: "original", label: t.stage.originalVersion },
                    { value: "both", label: <span className="hidden xl:inline">{t.stage.sideBySide}</span>, hint: t.stage.wideOnly },
                  ].filter((o) => o.value !== "both" || (typeof window !== "undefined" && window.innerWidth >= 1280)) as Array<{ value: "guided" | "original" | "both"; label: React.ReactNode }>}
                />
              )}
              <p className="mt-5 text-[12.5px] text-ink-3">{t.stage.clickHint}</p>
            </header>
            {version === "both" && lesson.isGraded ? (
              <div className="mt-6 grid grid-cols-2 gap-6">
                <div>
                  <p className="eyebrow mb-2">{t.stage.guided}</p>
                  <ReadingPane text={lesson.readingText} chunks={chunks} selected={selectedSentence} speakingIndex={null} activeChunk={activeChunk} className="!text-[16.5px]" onSentence={(s, p) => { setSelectedSentence(s); setActiveChunk(null); void openExplain(s, p); }} onChunk={(c, s) => { setActiveChunk(c.id); setSelectedSentence(null); void openExplain(c.phrase, s); }} onSelection={(sel, p) => void openExplain(sel, p)} />
                </div>
                <div>
                  <p className="eyebrow mb-2">{t.stage.original}</p>
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
            {micro && <GlossPanel glosses={lesson.glosses} />}
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
          <aside aria-label={t.stage.inspector} className="lg:sticky lg:top-[7.75rem] lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto">
            <div className="hidden lg:block">
              {explain ? (
                <div className="animate-in rounded-lg border border-line bg-card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="eyebrow">{t.stage.dissection}</p>
                    <button type="button" onClick={closeInspector} aria-label={t.stage.closeInspector} className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink"><X className="size-4" /></button>
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
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t.stage.dissection}>
              <button type="button" aria-label={t.common.close} className="absolute inset-0 bg-ink/25" onClick={closeInspector} />
              <div className="animate-in absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-sheet">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
                <div className="mb-2 flex justify-end">
                  <button type="button" onClick={closeInspector} aria-label={t.common.close} className="rounded p-1 text-ink-3 hover:bg-surface"><X className="size-4" /></button>
                </div>
                <ModeExplainer state={explain} tab={tab} onTab={setTab} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        {view === "COMPREHENSION" && <ComprehensionStage lessonId={lesson.id} questions={lesson.questions} source={lesson.readingText} title={lesson.article.title} onChange={after} minWords={micro ? 3 : 5} />}
        {view === "PRODUCTION" && (
          <ProductionStage
            key={lesson.production.length}
            lessonId={lesson.id}
            prompt={lesson.productionPrompt}
            promptVi={lesson.productionPromptVi}
            words={lesson.productionWords}
            wordBank={shell?.subBand === "Pre-A1" ? [...lesson.chunks.map((c) => c.phrase), ...lesson.glosses.map((g) => g.text)].filter((w, i, a) => a.indexOf(w) === i).slice(0, 18) : undefined}
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
        {view === "EXIT_TICKET" && <ExitTicketStage lessonId={lesson.id} chunks={lesson.chunks} onChange={after} minWords={micro ? 3 : 5} />}
        {view === "COMPLETED" && (lesson.receipt ? <ArsenalReceipt receipt={lesson.receipt} /> : <EmptyState title={t.stage.lessonDone} body={t.stage.lessonDoneBody} />)}
      </div>
    </div>
  );
}

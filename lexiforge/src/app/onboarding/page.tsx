"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, HelpCircle, Volume2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { bandName, bandShort, fmt, ieltsText, subtypeLabel, type Dict } from "@/lib/i18n";
import { countWords } from "@/lib/metrics/text";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SkillRadar } from "@/components/charts";
import { ErrorCards, type AnnotatedError } from "@/components/lf/error-annotator";
import { EVAL_PHASES, PhasedStatus } from "@/components/lf/states";
import { usePrefs } from "@/components/lf/prefs";
import { useShell } from "@/components/lf/shell-data";
import { LangSwitch } from "@/components/lf/lang-switch";
import { MetricInfo } from "@/components/lf/metric-tooltip";
import { ModEnterHint, submitOnModEnter } from "@/components/lesson/common";
import { speakOnce } from "@/components/lesson/speech";
import { isRetake, onboardingAccess } from "@/lib/diagnostic/access";

interface Progress {
  tier: number;
  served: number;
  total: number;
  visited: number[];
}
type Item =
  | { part: "AUDIO_MEANING"; id: string; say: string; options: string[]; progress: Progress }
  | { part: "PHRASE_MATCH"; id: string; situationVi: string; situationEn: string; options: string[]; progress: Progress }
  | { part: "WORD_ORDER"; id: string; hintVi: string; hintEn: string; chips: string[]; progress: Progress }
  | { part: "READING"; id: string; title: string; text: string; questions: Array<{ id: string; type: string; prompt: string; options: string[] }>; progress: Progress }
  | { part: "ERRORS"; id: string; segments: string[]; progress: Progress }
  | { part: "WRITING"; id: string; tier: number; promptEn: string; promptVi: string; hintsVi: string[]; minWords: number; maxWords: number; progress: Progress };

interface Step {
  assessmentId: string;
  phase: "OBJECTIVE" | "WRITING" | "DONE";
  tier: number;
  item: Item | null;
  report?: Report;
}

interface Report {
  subBand: string;
  subBandLabel: string;
  ielts: { band: number; low: number; high: number; halfWidth: number };
  level: number;
  stoppedEarly: boolean;
  skipped: number;
  tierAccuracy: Record<string, number>;
  sections: Record<string, { correct: number; total: number }>;
  strengths: string[];
  blockers: string[];
  metrics: { gai: number | null; lri: number | null; cpr: number; composite: number };
  writingFeedback: { errors: AnnotatedError[]; verdictEn: string; verdictVi: string } | null;
}

type Answer = { kind: "skip" } | { kind: "choice"; choice: number } | { kind: "choices"; choices: number[] } | { kind: "order"; words: string[] };

const GOALS = [
  { value: "A2_2", key: "goalA2" },
  { value: "B1_2", key: "goalB1" },
  { value: "B2_2", key: "goalB2" },
  { value: "C1_1", key: "goalC1" },
] as const;
const MINUTES = [15, 30, 45, 60];

function TierProgress({ step }: { step: Step | null }) {
  const { t } = usePrefs();
  const labels = [t.onboarding.step0, t.onboarding.stepTier0, t.onboarding.stepTier1, t.onboarding.stepTier2, t.onboarding.stepTier3, t.onboarding.stepWriting];
  // 0 = goal, 1..4 = tiers 0..3, 5 = writing
  const idx = !step ? 0 : step.phase === "WRITING" ? 5 : step.phase === "DONE" ? 6 : step.tier + 1;
  const visited = new Set((step?.item?.progress.visited ?? []).map((v) => v + 1));
  return (
    <ol className="flex items-center gap-1.5" aria-label={t.onboarding.studio}>
      {labels.map((l, i) => {
        const done = i < idx && (i === 0 || visited.has(i) || i === 5);
        return (
          <li key={l} className="flex items-center gap-1.5">
            {i > 0 && <span className={cn("h-px w-3 sm:w-6", i <= idx ? "bg-accent" : "bg-line")} aria-hidden />}
            <span aria-current={i === idx ? "step" : undefined} className={cn("flex items-center gap-1.5 text-[12px] font-medium", i === idx ? "text-ink" : "text-ink-3")}>
              <span className={cn("num flex size-5 items-center justify-center rounded-full text-[10.5px]", done ? "bg-accent text-accent-fg" : i === idx ? "bg-ink text-canvas" : "border border-line-strong")}>{done ? <Check className="size-3" aria-hidden /> : i + 1}</span>
              <span className={cn(i !== idx && "hidden lg:inline")}>{l}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function OptionButton({ selected, onClick, children, letter, disabled }: { selected?: boolean; onClick: () => void; children: React.ReactNode; letter: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn("flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left text-[15px] transition-colors duration-200 ease-lf disabled:opacity-60", selected ? "border-ink/40 bg-card shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "border-line bg-card hover:border-line-strong")}
    >
      <span className="num w-4 text-[12px] text-ink-3">{letter}</span>
      {children}
    </button>
  );
}

function DontKnow({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const { t } = usePrefs();
  return (
    <Button variant="ghost" size="md" onClick={onClick} disabled={disabled} className="text-ink-3">
      <HelpCircle aria-hidden /> {t.common.dontKnow}
    </Button>
  );
}

function Setup({ busy, onBegin }: { busy: boolean; onBegin: (v: { comfortTier: number; targetSubBand: string; dailyMinutes: number }) => void }) {
  const { t } = usePrefs();
  const [comfort, setComfort] = useState<number | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(30);
  const comforts = [t.onboarding.comfort0, t.onboarding.comfort1, t.onboarding.comfort2, t.onboarding.comfort3];
  return (
    <div className="animate-in mx-auto max-w-2xl">
      <p className="eyebrow">{t.onboarding.introEyebrow}</p>
      <h1 className="mt-3 font-serif text-[34px] font-medium leading-[1.15] tracking-[-0.02em] sm:text-[40px]">{t.onboarding.introTitle}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{t.onboarding.introBody}</p>

      <fieldset className="mt-8">
        <legend className="text-[16px] font-semibold">{t.onboarding.comfortQ}</legend>
        <div className="mt-3 grid gap-2">
          {comforts.map((c, i) => (
            <OptionButton key={c} letter={String(i)} selected={comfort === i} onClick={() => setComfort(i)}>{c}</OptionButton>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="text-[16px] font-semibold">{t.onboarding.goalQ}</legend>
        <div className="mt-3 grid gap-2">
          {GOALS.map((g, i) => (
            <OptionButton key={g.value} letter={"ABCD"[i] as string} selected={goal === g.value} onClick={() => setGoal(g.value)}>{t.onboarding[g.key]}</OptionButton>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="text-[16px] font-semibold">{t.onboarding.minutesQ}</legend>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MINUTES.map((m) => (
            <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={cn("num rounded-md border px-3 py-2.5 text-[14px] transition-colors", minutes === m ? "border-ink/40 bg-card font-semibold text-ink" : "border-line bg-card text-ink-2 hover:border-line-strong")}>
              {fmt(t.onboarding.minutesOpt, { n: m })}
            </button>
          ))}
        </div>
      </fieldset>

      <Button size="lg" className="mt-8 w-full sm:w-auto" disabled={busy || comfort === null || goal === null} onClick={() => comfort !== null && goal && onBegin({ comfortTier: comfort, targetSubBand: goal, dailyMinutes: minutes })}>
        {t.onboarding.begin} <ArrowRight aria-hidden />
      </Button>
    </div>
  );
}

function WordOrder({ item, busy, onAnswer }: { item: Extract<Item, { part: "WORD_ORDER" }>; busy: boolean; onAnswer: (a: Answer) => void }) {
  const { t, pick } = usePrefs();
  const [picked, setPicked] = useState<number[]>([]);
  const rest = item.chips.map((c, i) => ({ c, i })).filter(({ i }) => !picked.includes(i));
  return (
    <div>
      <h2 className="text-[16px] font-semibold">{t.onboarding.orderQ}</h2>
      <p className="mt-1 text-[14px] text-ink-2">{fmt(t.onboarding.orderMeaning, { hint: pick(item.hintEn, item.hintVi) })}</p>
      <div className="mt-5 flex min-h-14 flex-wrap items-center gap-2 rounded-md border border-dashed border-line-strong bg-card p-3" aria-live="polite">
        {picked.map((i) => (
          <button key={i} type="button" onClick={() => setPicked((p) => p.filter((x) => x !== i))} className="rounded-md bg-ink px-3 py-1.5 text-[15px] text-canvas">{item.chips[i]}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {rest.map(({ c, i }) => (
          <button key={i} type="button" onClick={() => setPicked((p) => [...p, i])} className="rounded-md border border-line bg-card px-3 py-1.5 text-[15px] hover:border-line-strong">{c}</button>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button onClick={() => onAnswer({ kind: "order", words: picked.map((i) => item.chips[i] as string) })} disabled={busy || picked.length !== item.chips.length}>{t.common.check} <ArrowRight aria-hidden /></Button>
        <Button variant="outline" onClick={() => setPicked([])} disabled={busy || picked.length === 0}>{t.onboarding.orderClear}</Button>
        <span className="ml-auto"><DontKnow onClick={() => onAnswer({ kind: "skip" })} disabled={busy} /></span>
      </div>
    </div>
  );
}

function Objective({ item, busy, onAnswer }: { item: Exclude<Item, { part: "WRITING" }>; busy: boolean; onAnswer: (a: Answer) => void }) {
  const { t, pick } = usePrefs();
  const [plays, setPlays] = useState(0);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const tierName = [t.onboarding.stepTier0, t.onboarding.stepTier1, t.onboarding.stepTier2, t.onboarding.stepTier3][item.progress.tier] ?? "";
  const header = <p className="num eyebrow">{tierName} · {item.progress.served}/{item.progress.total}</p>;

  if (item.part === "AUDIO_MEANING") {
    const play = () => {
      speakOnce(item.say, 0.8);
      setPlays((p) => p + 1);
    };
    return (
      <div>
        {header}
        <h2 className="mt-2 text-[18px] font-semibold">{t.onboarding.audioQ}</h2>
        <button type="button" onClick={play} className="mt-5 flex items-center gap-3 rounded-full border border-line bg-card px-5 py-3 text-[15px] font-medium hover:border-line-strong">
          <Volume2 className="size-5 text-accent" aria-hidden /> {t.onboarding.playAudio}
          <span className="num text-[12px] text-ink-3">{fmt(t.onboarding.audioPlays, { n: plays })}</span>
        </button>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {item.options.map((o, i) => <OptionButton key={o} letter={"ABCD"[i] as string} disabled={busy || plays === 0} onClick={() => onAnswer({ kind: "choice", choice: i })}>{o}</OptionButton>)}
        </div>
        <div className="mt-6 flex justify-end"><DontKnow onClick={() => onAnswer({ kind: "skip" })} disabled={busy} /></div>
      </div>
    );
  }
  if (item.part === "PHRASE_MATCH") {
    return (
      <div>
        {header}
        <h2 className="mt-2 text-[18px] font-semibold">{t.onboarding.phraseQ}</h2>
        <p className="mt-2 text-[15px] text-ink-2">{pick(item.situationEn, item.situationVi)}</p>
        <div className="mt-6 grid gap-2">
          {item.options.map((o, i) => <OptionButton key={o} letter={"ABCD"[i] as string} disabled={busy} onClick={() => onAnswer({ kind: "choice", choice: i })}>{o}</OptionButton>)}
        </div>
        <div className="mt-6 flex justify-end"><DontKnow onClick={() => onAnswer({ kind: "skip" })} disabled={busy} /></div>
      </div>
    );
  }
  if (item.part === "WORD_ORDER") return <div>{header}<div className="mt-2"><WordOrder key={item.id} item={item} busy={busy} onAnswer={onAnswer} /></div></div>;
  if (item.part === "READING") {
    return (
      <div>
        {header}
        <p className="mt-2 text-[14px] text-ink-2">{t.onboarding.readingQ}</p>
        <h2 className="mt-2 font-serif text-[26px] font-medium tracking-[-0.01em]">{item.title}</h2>
        <p className="reading mt-4 text-ink">{item.text}</p>
        <div className="mt-8 space-y-6">
          {item.questions.map((q, qi) => (
            <fieldset key={q.id}>
              <legend className="text-[15px] font-medium text-ink"><span className="num mr-2 text-ink-3">{qi + 1}.</span>{q.prompt}</legend>
              <div className="mt-3 grid gap-2">
                {q.options.map((o, i) => (
                  <OptionButton key={o} letter={"ABCD"[i] as string} selected={choices[q.id] === i} onClick={() => setChoices((c) => ({ ...c, [q.id]: i }))}>{o}</OptionButton>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-end gap-2">
          <DontKnow onClick={() => onAnswer({ kind: "skip" })} disabled={busy} />
          <Button onClick={() => onAnswer({ kind: "choices", choices: item.questions.map((q) => choices[q.id] as number) })} disabled={busy || item.questions.some((q) => choices[q.id] === undefined)}>
            {t.common.continue_} <ArrowRight aria-hidden />
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div>
      {header}
      <h2 className="mt-2 text-[15px] font-medium text-ink-2">{t.onboarding.errorQ}</h2>
      <p className="mt-8 font-serif text-[23px] leading-[1.9] text-ink">
        {item.segments.map((s, i) => (
          <span key={i}>
            <span className="border-b-2 border-dotted border-ink-3 pb-0.5">{s}</span>
            <sup className="num px-1 text-[12px] text-ink-3">{"ABCD"[i]}</sup>{" "}
          </span>
        ))}
      </p>
      <div className="mt-10 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {["A", "B", "C", "D", t.onboarding.noError].map((label, i) => (
          <Button key={label} variant="outline" size="lg" className="num" disabled={busy} onClick={() => onAnswer({ kind: "choice", choice: i })}>{label}</Button>
        ))}
      </div>
      <div className="mt-6 flex justify-end"><DontKnow onClick={() => onAnswer({ kind: "skip" })} disabled={busy} /></div>
    </div>
  );
}

function Writing({ item, busy, onSubmit, onSkip }: { item: Extract<Item, { part: "WRITING" }>; busy: boolean; onSubmit: (text: string) => void; onSkip: () => void }) {
  const { t, lang } = usePrefs();
  const [text, setText] = useState("");
  const words = useMemo(() => countWords(text), [text]);
  const ok = words >= item.minWords && words <= item.maxWords;
  return (
    <div className="animate-in mx-auto max-w-2xl">
      <p className="eyebrow">{t.onboarding.writingTitle}</p>
      <h2 className="mt-2 font-serif text-[23px] font-medium leading-snug tracking-[-0.01em]">{item.promptEn}</h2>
      {lang === "vi" && <p className="mt-2 text-[14.5px] text-ink-2">{item.promptVi}</p>}
      {item.hintsVi.length > 0 && (
        <div className="mt-4">
          <p className="text-[12.5px] font-medium text-ink-3">{t.onboarding.writingHints}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">{item.hintsVi.map((h) => <li key={h} className="rounded-full border border-line bg-card px-2.5 py-1 text-[13px] text-ink-2">{h}</li>)}</ul>
        </div>
      )}
      <div className="mt-5 rounded-lg border border-line bg-card">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} onPaste={(e) => e.preventDefault()} onKeyDown={submitOnModEnter(() => ok && onSubmit(text))} rows={item.tier === 1 ? 6 : 11} spellCheck={false} autoCorrect="off" disabled={busy} aria-label={t.onboarding.writingTitle} className="rounded-none border-0 px-5 py-4 font-serif text-[17.5px] leading-[1.8] focus:ring-0" placeholder={t.onboarding.writingNoPaste} />
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <span className={cn("num text-[12.5px]", ok ? "text-ink-3" : "text-moderate-ink")}>{fmt(t.common.wordsRange, { n: words, min: item.minWords, max: item.maxWords })}</span>
          <span className="ml-auto flex items-center gap-2">
            <ModEnterHint />
            <Button onClick={() => onSubmit(text)} disabled={busy || !ok}>{busy ? t.onboarding.grading : t.onboarding.submitWriting}</Button>
          </span>
        </div>
      </div>
      <div className="mt-3 flex justify-end"><Button variant="ghost" className="text-ink-3" onClick={onSkip} disabled={busy}>{t.onboarding.skipWriting}</Button></div>
      <PhasedStatus className="mt-4" phases={EVAL_PHASES} active={busy} />
    </div>
  );
}

const skillName = (t: Dict, code: string) => (t.skill as Record<string, string>)[code] ?? subtypeLabel(t, code);

function Dossier({ report }: { report: Report }) {
  const router = useRouter();
  const { t, pick } = usePrefs();
  const [active, setActive] = useState<number | null>(null);
  const fb = report.writingFeedback;
  return (
    <div className="animate-in mx-auto max-w-4xl space-y-6">
      <div className="text-center">
        <p className="eyebrow">{t.onboarding.dossierEyebrow}</p>
        <h1 className="mt-2 font-serif text-[34px] font-medium leading-tight tracking-[-0.015em]">{t.onboarding.dossierTitle}</h1>
        {report.stoppedEarly && <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-2">{t.onboarding.dossierEarly}</p>}
      </div>
      <div className="grid overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2" style={{ gap: 1 }}>
        <div className="bg-card p-6 text-center">
          <p className="eyebrow flex items-center justify-center gap-1.5">{t.onboarding.level} <MetricInfo metric="cefr" /></p>
          <p className="num mt-2 text-[44px] font-semibold leading-none">{bandShort(report.subBand)}</p>
          <p className="mt-2 text-[14px] font-medium text-ink-2">{bandName(t, report.subBand)}</p>
          <p className="num mt-1 text-[12px] text-ink-3">{fmt(t.onboarding.levelScore, { n: report.level.toFixed(1) })}</p>
        </div>
        <div className="bg-card p-6 text-center">
          <p className="eyebrow flex items-center justify-center gap-1.5">{t.metric.ieltsName} <MetricInfo metric="ielts" /></p>
          <p className="num mt-2 text-[44px] font-semibold leading-none">{ieltsText(report.ielts.band)}</p>
          <p className="num mt-2 text-[12px] text-ink-3">{fmt(t.onboarding.ieltsRange, { low: report.ielts.low.toFixed(1), high: report.ielts.high.toFixed(1) })}</p>
          {report.skipped > 0 && <p className="mt-1 text-[12px] text-ink-3">{fmt(t.onboarding.skippedCount, { n: report.skipped })}</p>}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <div className="rounded-lg border border-line bg-card p-5">
          <p className="text-[15px] font-semibold">{t.onboarding.strengths}</p>
          <ul className="mt-3 space-y-2">
            {report.strengths.length === 0 && <li className="text-[13.5px] text-ink-3">{t.onboarding.noStrengths}</li>}
            {report.strengths.map((s) => (
              <li key={s} className="flex items-center gap-2 text-[14px]"><Check className="size-4 text-mastered-ink" aria-hidden />{skillName(t, s)}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-line bg-card p-5">
          <p className="text-[15px] font-semibold">{t.onboarding.blockers}</p>
          <ol className="mt-3 space-y-3">
            {report.blockers.length === 0 && <li className="text-[13.5px] text-ink-3">{t.onboarding.noBlockers}</li>}
            {report.blockers.map((b, i) => {
              const ex = fb?.errors.find((e) => e.subtype === b);
              return (
                <li key={b} className="flex gap-3">
                  <span className="num mt-0.5 text-[12px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="font-medium text-ink">{skillName(t, b)}</p>
                    {ex && <p className="text-[13px] text-ink-2"><span className="text-critical-ink line-through">{ex.original}</span> → <span className="text-mastered-ink">{ex.correction}</span> · {pick(ex.ruleEn, ex.ruleVi)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className="rounded-lg border border-line bg-card p-5">
        <p className="text-[15px] font-semibold">{t.onboarding.snapshot}</p>
        <p className="text-[12.5px] text-ink-3">{t.onboarding.snapshotNote}</p>
        <SkillRadar
          height={240}
          data={[
            { metric: "GAI", value: report.metrics.gai ?? 0, hasEvidence: report.metrics.gai !== null },
            { metric: "LRI", value: report.metrics.lri ?? 0, hasEvidence: report.metrics.lri !== null },
            { metric: "CPR", value: report.metrics.cpr, hasEvidence: true },
            { metric: "RSS", value: 0, hasEvidence: false },
            { metric: "ERI", value: 0, hasEvidence: false },
          ]}
        />
      </div>
      {fb && (
        <details className="group rounded-lg border border-line bg-card" open={fb.errors.length > 0 && fb.errors.length <= 3}>
          <summary className="cursor-pointer list-none px-5 py-4 text-[14px] font-medium">{t.onboarding.writingVerdict}</summary>
          <div className="space-y-4 border-t border-line p-5">
            <p className="text-[14px] text-ink-2">{pick(fb.verdictEn, fb.verdictVi)}</p>
            {fb.errors.length > 0 && <ErrorCards errors={fb.errors} active={active} onSelect={setActive} />}
          </div>
        </details>
      )}
      <div className="flex justify-center pt-2">
        <Button size="lg" onClick={() => router.push("/roadmap")}>{t.onboarding.viewRoadmap} <ArrowRight aria-hidden /></Button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { refresh } = useShell();
  const { t, err } = usePrefs();
  const [step, setStep] = useState<Step | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retaking, setRetaking] = useState(false);

  useEffect(() => {
    const retake = isRetake(window.location.search);
    setRetaking(retake);
    api<{ calibrated: boolean; placement: Step | null; hasRoadmap: boolean }>("/api/diagnostic")
      .then((s) => {
        if (s.placement) setStep(s.placement);
        else if (onboardingAccess({ calibrated: s.calibrated, hasRoadmap: s.hasRoadmap, retake, inProgress: false }) === "REDIRECT_HOME") router.replace("/");
      })
      .catch((e) => setError(err(e)))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, [router]);

  async function run(fn: () => Promise<Step | null>) {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      if (next) {
        setStep(next);
        if (next.report) {
          setReport(next.report);
          await refresh();
        }
      }
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  const begin = (v: { comfortTier: number; targetSubBand: string; dailyMinutes: number }) => void run(() => api<Step>("/api/diagnostic", { action: "setup", ...v }));
  const answer = (a: Answer) => void run(async () => (step?.item ? api<Step>("/api/diagnostic", { action: "answer", assessmentId: step.assessmentId, unitId: step.item.id, answer: a }) : null));
  const write = (text: string) => void run(async () => (step ? api<Step>("/api/diagnostic", { action: "write", assessmentId: step.assessmentId, text }) : null));
  const skipWriting = () => void run(async () => (step ? api<Step>("/api/diagnostic", { action: "skipWriting", assessmentId: step.assessmentId }) : null));

  const item = step?.item ?? null;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur md:px-8">
        <span className="flex size-7 items-center justify-center rounded-md bg-ink font-serif text-[15px] font-semibold text-canvas" aria-hidden>L</span>
        <span className="hidden text-[14px] font-semibold md:inline">{t.onboarding.studio}</span>
        <div className="mx-auto min-w-0 overflow-hidden">{!report && <TierProgress step={step} />}</div>
        <LangSwitch />
      </header>
      <main className="px-4 py-10 md:px-8">
        {error && <p role="alert" className="mx-auto mb-6 max-w-2xl rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}
        {report ? (
          <Dossier report={report} />
        ) : !loaded ? (
          <div className="mx-auto max-w-2xl space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40" /></div>
        ) : !step ? (
          <>
            {retaking && <p className="mx-auto mb-6 max-w-2xl rounded-md border border-line bg-card p-3 text-[13.5px] text-ink-2">{t.onboarding.retakeNote}</p>}
            <Setup busy={busy} onBegin={begin} />
          </>
        ) : item?.part === "WRITING" ? (
          <Writing key={item.id} item={item} busy={busy} onSubmit={write} onSkip={skipWriting} />
        ) : item ? (
          <div key={item.id} className="animate-in mx-auto max-w-2xl">
            <Objective item={item} busy={busy} onAnswer={answer} />
          </div>
        ) : null}
      </main>
    </div>
  );
}

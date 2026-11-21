"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { humanize } from "@/lib/client/format";
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
import { ModEnterHint, submitOnModEnter } from "@/components/lesson/common";

type Item =
  | { part: "READING"; id: string; title: string; text: string; questions: Array<{ id: string; type: string; prompt: string; options: string[] }>; progress: { served: number; total: number } }
  | { part: "ERRORS"; id: string; segments: string[]; progress: { served: number; total: number } }
  | { part: "WRITING"; id: string; prompt: string; minWords: number; maxWords: number };

interface Step {
  assessmentId: string;
  part: "READING" | "ERRORS" | "WRITING" | "DONE";
  item: Item | null;
}

interface Report {
  subBand: string;
  ielts: { band: number; low: number; high: number; halfWidth: number };
  level: number;
  parts: { reading: { accuracy: number }; errorDetection: { accuracy: number; missedTraps: string[] }; writing: { level: number; gai: { gai: number; weightedErrorsPer100W: number }; lri: { lri: number } } };
  metrics: { gai: number; lri: number; cpr: number; composite: number };
  topWeaknesses: string[];
  writingFeedback: { errors: AnnotatedError[]; verdictEn: string; verdictVi: string; nativeUpgrade: string };
}

const STEPS = [
  { part: "READING", label: "Nuance Reading" },
  { part: "ERRORS", label: "Error Detection" },
  { part: "WRITING", label: "Unassisted Writing" },
] as const;

function Progress({ part }: { part: Step["part"] | null }) {
  const idx = part === null ? -1 : part === "DONE" ? 3 : STEPS.findIndex((s) => s.part === part);
  return (
    <ol className="flex items-center gap-2" aria-label="Audit progress">
      {STEPS.map((s, i) => (
        <li key={s.part} className="flex items-center gap-2">
          {i > 0 && <span className={cn("h-px w-6 sm:w-12", i <= idx ? "bg-accent" : "bg-line")} aria-hidden />}
          <span aria-current={i === idx ? "step" : undefined} className={cn("flex items-center gap-2 text-[12.5px] font-medium", i === idx ? "text-ink" : i < idx ? "text-ink-2" : "text-ink-3")}>
            <span className={cn("num flex size-6 items-center justify-center rounded-full text-[11px]", i < idx ? "bg-accent text-accent-fg" : i === idx ? "bg-ink text-canvas" : "border border-line-strong")}>{i < idx ? <Check className="size-3.5" aria-hidden /> : i + 1}</span>
            <span className={cn(i !== idx && "hidden sm:inline")}>{s.label}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Dossier({ report }: { report: Report }) {
  const router = useRouter();
  const { pick } = usePrefs();
  const [active, setActive] = useState<number | null>(null);
  const bottlenecks = report.topWeaknesses.slice(0, 3);
  return (
    <div className="animate-in mx-auto max-w-4xl space-y-6">
      <div className="text-center">
        <p className="eyebrow">Diagnostic dossier</p>
        <h1 className="mt-2 font-serif text-[36px] font-medium leading-tight tracking-[-0.015em]">Your measured baseline</h1>
        <p className="mx-auto mt-2 max-w-xl text-[14px] text-ink-2">Computed from {report.parts.writing.gai ? "your writing sample, " : ""}adaptive reading and error-detection items. One audit is limited evidence — the range narrows as you work.</p>
      </div>
      <div className="grid overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3" style={{ gap: 1 }}>
        <div className="bg-card p-6 text-center">
          <p className="eyebrow">CEFR sub-band</p>
          <p className="num mt-2 text-[44px] font-semibold leading-none">{report.subBand}</p>
          <p className="num mt-2 text-[12px] text-ink-3">level {report.level.toFixed(1)} / 100</p>
        </div>
        <div className="bg-card p-6 text-center">
          <p className="eyebrow">Est. IELTS band</p>
          <p className="num mt-2 text-[44px] font-semibold leading-none">{report.ielts.band.toFixed(1)}</p>
          <p className="num mt-2 text-[12px] text-ink-3">95% range {report.ielts.low.toFixed(1)}–{report.ielts.high.toFixed(1)} · diagnostic equivalent</p>
        </div>
        <div className="bg-card p-6">
          <p className="eyebrow mb-2">Part results</p>
          <dl className="num space-y-1.5 text-[13px]">
            <div className="flex justify-between"><dt className="text-ink-2">Reading accuracy</dt><dd>{report.parts.reading.accuracy.toFixed(0)}%</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Error detection</dt><dd>{report.parts.errorDetection.accuracy.toFixed(0)}%</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Writing GAI</dt><dd>{report.parts.writing.gai.gai.toFixed(1)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Writing LRI</dt><dd>{report.parts.writing.lri.lri.toFixed(1)}</dd></div>
          </dl>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_1.1fr] [&>*]:min-w-0">
        <div className="rounded-lg border border-line bg-card p-5">
          <p className="text-[15px] font-semibold">5-axis snapshot</p>
          <p className="text-[12.5px] text-ink-3">Retention and error recurrence need history; they start without evidence.</p>
          <SkillRadar
            height={240}
            data={[
              { metric: "GAI", value: report.metrics.gai, hasEvidence: true },
              { metric: "LRI", value: report.metrics.lri, hasEvidence: true },
              { metric: "CPR", value: report.metrics.cpr, hasEvidence: true },
              { metric: "RSS", value: 0, hasEvidence: false },
              { metric: "ERI", value: 0, hasEvidence: false },
            ]}
          />
        </div>
        <div className="rounded-lg border border-line bg-card p-5">
          <p className="text-[15px] font-semibold">Top bottlenecks</p>
          <ol className="mt-3 space-y-3">
            {bottlenecks.length === 0 && <li className="text-[13.5px] text-ink-3">No recurring weakness surfaced in this audit.</li>}
            {bottlenecks.map((b, i) => {
              const ex = report.writingFeedback.errors.find((e) => e.subtype === b);
              return (
                <li key={b} className="flex gap-3">
                  <span className="num mt-0.5 text-[12px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="font-medium text-ink">{humanize(b)}</p>
                    {ex ? (
                      <p className="text-[13px] text-ink-2"><span className="text-critical-ink line-through">{ex.original}</span> → <span className="text-mastered-ink">{ex.correction}</span> · {pick(ex.ruleEn, ex.ruleVi)}</p>
                    ) : (
                      <p className="text-[13px] text-ink-3">Missed in the error-detection audit.</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 border-t border-line pt-3 text-[13.5px] text-ink-2">{pick(report.writingFeedback.verdictEn, report.writingFeedback.verdictVi)}</p>
        </div>
      </div>
      {report.writingFeedback.errors.length > 0 && (
        <details className="group rounded-lg border border-line bg-card">
          <summary className="cursor-pointer list-none px-5 py-4 text-[14px] font-medium">Writing diagnosis <span className="num text-ink-3">· {report.writingFeedback.errors.length} errors</span></summary>
          <div className="border-t border-line p-5">
            <ErrorCards errors={report.writingFeedback.errors} active={active} onSelect={setActive} />
          </div>
        </details>
      )}
      <div className="flex justify-center pt-2">
        <Button size="lg" onClick={() => router.push("/")}>Enter Today&apos;s i+1 Briefing <ArrowRight aria-hidden /></Button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { refresh } = useShell();
  const [step, setStep] = useState<Step | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [writing, setWriting] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    api<{ calibrated: boolean; placement: Step | null }>("/api/diagnostic")
      .then((s) => {
        if (s.placement) {
          setStep(s.placement);
          setStartedAt(Date.now());
        } else if (s.calibrated) router.replace("/");
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoaded(true));
  }, [router]);

  useEffect(() => {
    if (!startedAt || report) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt, report]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const begin = () =>
    run(async () => {
      setStep(await api<Step>("/api/diagnostic", { action: "start", kind: "PLACEMENT" }));
      setStartedAt(Date.now());
    });
  const answer = (body: Record<string, unknown>) =>
    run(async () => {
      if (!step) return;
      setStep(await api<Step>("/api/diagnostic", { action: "answer", assessmentId: step.assessmentId, ...body }));
      setChoices({});
      window.scrollTo({ top: 0 });
    });
  const submitWriting = () =>
    run(async () => {
      if (!step) return;
      const r = await api<{ report: Report }>("/api/diagnostic", { action: "write", assessmentId: step.assessmentId, text: writing });
      setReport(r.report);
      await refresh();
    });

  const words = useMemo(() => countWords(writing), [writing]);
  const item = step?.item ?? null;
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-line bg-canvas/90 px-4 backdrop-blur md:px-8">
        <span className="flex size-7 items-center justify-center rounded-md bg-ink font-serif text-[15px] font-semibold text-canvas" aria-hidden>L</span>
        <span className="hidden text-[14px] font-semibold sm:inline">Calibration audit</span>
        <div className="mx-auto">{!report && <Progress part={step?.part ?? null} />}</div>
        <span className="num w-16 text-right text-[12.5px] text-ink-3">{step && !report ? mmss : ""}</span>
      </header>
      <main className="px-4 py-10 md:px-8">
        {error && <p className="mx-auto mb-6 max-w-2xl rounded-md bg-critical-wash p-3 text-[13px] text-critical-ink">{error}</p>}
        {report ? (
          <Dossier report={report} />
        ) : !loaded ? (
          <div className="mx-auto max-w-2xl space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40" /></div>
        ) : !step ? (
          <div className="animate-in mx-auto max-w-2xl text-center">
            <p className="eyebrow">Before your first lesson</p>
            <h1 className="mt-3 font-serif text-[40px] font-medium leading-[1.1] tracking-[-0.02em]">Levels are measured here, never self-reported.</h1>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-ink-2">About twenty minutes in three parts. No dictionaries, no translators. Items adapt to your answers, from A2 to C1.</p>
            <ol className="mx-auto mt-8 grid max-w-xl gap-px overflow-hidden rounded-lg border border-line bg-line text-left sm:grid-cols-3">
              {[["Nuance reading", "Short authentic passages; inference and nuance."], ["Error detection", "Grammar and Vietlish traps in context."], ["Unassisted writing", "80–120 words, graded by the strict engine."]].map(([t, d], i) => (
                <li key={t} className="bg-card p-4">
                  <span className="num text-[12px] text-ink-3">0{i + 1}</span>
                  <p className="mt-1 text-[14px] font-semibold">{t}</p>
                  <p className="mt-1 text-[12.5px] text-ink-3">{d}</p>
                </li>
              ))}
            </ol>
            <Button size="lg" className="mt-8" onClick={() => void begin()} disabled={busy}>Begin calibration</Button>
          </div>
        ) : item?.part === "READING" ? (
          <div key={item.id} className="animate-in mx-auto max-w-2xl">
            <p className="num eyebrow">Passage {item.progress.served} of {item.progress.total}</p>
            <h2 className="mt-2 font-serif text-[28px] font-medium tracking-[-0.01em]">{item.title}</h2>
            <p className="reading mt-4 text-ink">{item.text}</p>
            <div className="mt-8 space-y-6">
              {item.questions.map((q, qi) => (
                <fieldset key={q.id}>
                  <legend className="text-[15px] font-medium text-ink"><span className="num mr-2 text-ink-3">{qi + 1}.</span>{q.prompt}</legend>
                  <div className="mt-3 grid gap-2">
                    {q.options.map((o, i) => (
                      <label key={o} className={cn("flex cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2.5 text-[14px] transition-colors duration-200 ease-lf", choices[q.id] === i ? "border-ink/40 bg-card shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "border-line bg-card hover:border-line-strong")}>
                        <input type="radio" name={q.id} className="accent-[rgb(var(--accent))]" checked={choices[q.id] === i} onChange={() => setChoices((c) => ({ ...c, [q.id]: i }))} />
                        <span className="num w-4 text-[12px] text-ink-3">{"ABCD"[i]}</span>
                        {o}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <Button onClick={() => void answer({ itemId: item.id, choices: item.questions.map((q) => choices[q.id]) })} disabled={busy || item.questions.some((q) => choices[q.id] === undefined)}>
                Continue <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        ) : item?.part === "ERRORS" ? (
          <div key={item.id} className="animate-in mx-auto max-w-2xl">
            <p className="num eyebrow">Item {item.progress.served} of {item.progress.total}</p>
            <h2 className="mt-2 text-[15px] font-medium text-ink-2">Which segment contains an error? Choose “No error” if the sentence is correct.</h2>
            <p className="mt-8 font-serif text-[24px] leading-[1.9] text-ink">
              {item.segments.map((s, i) => (
                <span key={i}>
                  <span className="border-b-2 border-dotted border-ink-3 pb-0.5">{s}</span>
                  <sup className="num px-1 text-[12px] text-ink-3">{"ABCD"[i]}</sup>{" "}
                </span>
              ))}
            </p>
            <div className="mt-10 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {["A", "B", "C", "D", "No error"].map((label, i) => (
                <Button key={label} variant="outline" size="lg" className="num" disabled={busy} onClick={() => void answer({ itemId: item.id, choice: i })}>{label}</Button>
              ))}
            </div>
          </div>
        ) : item?.part === "WRITING" ? (
          <div className="animate-in mx-auto max-w-2xl">
            <p className="eyebrow">Unassisted writing</p>
            <h2 className="mt-2 font-serif text-[24px] font-medium leading-snug tracking-[-0.01em]">{item.prompt}</h2>
            <div className="mt-6 rounded-lg border border-line bg-card">
              <Textarea value={writing} onChange={(e) => setWriting(e.target.value)} onPaste={(e) => e.preventDefault()} onKeyDown={submitOnModEnter(() => { if (words >= item.minWords && words <= item.maxWords) void submitWriting(); })} rows={12} spellCheck={false} autoCorrect="off" disabled={busy} aria-label="Writing sample" className="rounded-none border-0 px-5 py-4 font-serif text-[17.5px] leading-[1.8] focus:ring-0" placeholder="Pasting and spell-check are off." />
              <div className="flex items-center gap-3 border-t border-line px-4 py-3">
                <span className={cn("num text-[12.5px]", words < item.minWords || words > item.maxWords ? "text-moderate-ink" : "text-ink-3")}>{words} words · 80–120 target</span>
                <span className="ml-auto flex items-center gap-2">
                  <ModEnterHint />
                  <Button onClick={() => void submitWriting()} disabled={busy || words < item.minWords || words > item.maxWords}>{busy ? "Grading…" : "Submit for grading"}</Button>
                </span>
              </div>
            </div>
            <PhasedStatus className="mt-4" phases={EVAL_PHASES} active={busy} />
          </div>
        ) : null}
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/components/lf/prefs";
import { ErrorCards, type AnnotatedError } from "@/components/lf/error-annotator";
import { EVAL_PHASES, PhasedStatus } from "@/components/lf/states";
import { submitOnModEnter } from "@/components/lesson/common";
import { ItemDots, SessionDone, type SentenceSession } from "./shared";

interface CheckResult {
  passed: boolean;
  errors: AnnotatedError[];
  verdict: { en: string; vi: string } | null;
  reveal: string | null;
  trapVi: string | null;
  session: SentenceSession;
}

export function SentenceMode({ session, onSession, onAgain }: { session: SentenceSession; onSession: (s: SentenceSession) => void; onAgain: () => void }) {
  const { t, fmt, err, pick } = usePrefs();
  const firstOpen = session.items.findIndex((i) => !i.passed);
  const [idx, setIdx] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = session.items[idx];

  useEffect(() => {
    setPicked([]);
    setText("");
    setResult(null);
    setError(null);
  }, [idx]);

  async function check() {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const body = session.chipMode ? { chips: picked.map((i) => item.chips[i] as string) } : { text };
      const r = await api<CheckResult>("/api/practice", { action: "sentence.check", sessionId: session.id, index: idx, ...body });
      setResult(r);
      setActive(null);
      onSession(r.session);
      if (!r.passed && session.chipMode) setPicked([]);
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  if (!item) return null;
  const current = session.items[idx] ?? item;
  const allDone = session.items.every((i) => i.passed);
  const nextOpen = session.items.findIndex((i, k) => k > idx && !i.passed);
  const rest = item.chips.map((c, i) => ({ c, i })).filter(({ i }) => !picked.includes(i));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ItemDots items={session.items.map((i) => ({ done: i.passed }))} current={idx} onPick={setIdx} />
        <span className="num ml-auto text-[12.5px] text-ink-3">{fmt(t.practice.itemOf, { n: idx + 1, total: session.items.length })}</span>
      </div>
      <div className="rounded-lg border border-line bg-card p-5">
        <p className="eyebrow">{t.practice.translate}</p>
        <p className="mt-2 text-[21px] font-medium leading-snug text-ink">{item.vi}</p>
        {!current.passed && (
          session.chipMode ? (
            <div className="mt-5">
              <p className="text-[13px] text-ink-3">{t.practice.chipsHint}</p>
              <div className="mt-3 flex min-h-14 flex-wrap items-center gap-2 rounded-md border border-dashed border-line-strong bg-canvas p-3" aria-live="polite">
                {picked.map((i) => (
                  <button key={i} type="button" onClick={() => setPicked((p) => p.filter((x) => x !== i))} className="rounded-md bg-ink px-3 py-1.5 font-serif text-[16px] text-canvas">{item.chips[i]}</button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {rest.map(({ c, i }) => (
                  <button key={i} type="button" onClick={() => setPicked((p) => [...p, i])} className="rounded-md border border-line bg-card px-3 py-1.5 font-serif text-[16px] hover:border-line-strong">{c}</button>
                ))}
              </div>
            </div>
          ) : (
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={submitOnModEnter(() => void check())} onPaste={(e) => e.preventDefault()} rows={2} spellCheck={false} autoCorrect="off" placeholder={t.practice.typeEnglish} aria-label={t.practice.typeEnglish} className="mt-5 w-full rounded-md border border-line bg-canvas px-3.5 py-3 font-serif text-[18px] outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/10" />
          )
        )}
        {!current.passed && (
          <div className="mt-3 flex items-center justify-end gap-2">
            <PhasedStatus className="flex-1" phases={EVAL_PHASES.slice(0, 3)} active={busy && !session.chipMode} />
            <Button onClick={() => void check()} disabled={busy || (session.chipMode ? picked.length === 0 : !text.trim())}>{busy ? t.common.checking : t.common.check}</Button>
          </div>
        )}
        {result && (
          <div className={cn("mt-5 rounded-md border p-4", result.passed ? "border-mastered/40 bg-mastered-wash" : "border-critical/30 bg-critical-wash")}>
            <p className={cn("text-[14px] font-semibold", result.passed ? "text-mastered-ink" : "text-critical-ink")}>{result.passed ? t.practice.sentencePass : t.practice.sentenceFail}</p>
            {result.verdict && <p className="mt-1 text-[13.5px] text-ink-2">{pick(result.verdict.en, result.verdict.vi)}</p>}
            {result.reveal && (
              <p className="mt-2 text-[13.5px] text-ink-2">{t.practice.revealAnswer} <span className="font-serif text-[16px] text-ink">{result.reveal}</span></p>
            )}
          </div>
        )}
        {result && result.errors.length > 0 && <div className="mt-4"><ErrorCards errors={result.errors} active={active} onSelect={setActive} /></div>}
        {current.passed && (
          <div className="mt-4 space-y-2">
            {current.answer && <p className="font-serif text-[18px] text-mastered-ink">{current.answer}</p>}
            {current.trapVi && <p className="text-[13.5px] text-ink-2"><span className="font-semibold text-ink">{t.practice.trap}: </span>{current.trapVi}</p>}
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-[13px] text-critical-ink">{error}</p>}
      </div>
      {current.passed && nextOpen >= 0 && <div className="flex justify-end"><Button onClick={() => setIdx(nextOpen)}>{t.practice.next} →</Button></div>}
      {allDone && <SessionDone score={session.score} onAgain={onAgain} />}
    </div>
  );
}

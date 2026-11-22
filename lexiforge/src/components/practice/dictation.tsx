"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Lightbulb, RotateCcw, Volume2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/components/lf/prefs";
import { speakOnce } from "@/components/lesson/speech";
import { submitOnModEnter } from "@/components/lesson/common";
import { ItemDots, SessionDone, WordDiffLine, type DictationSession, type WordDiffView } from "./shared";

const RATES = [0.7, 0.85, 1] as const;

/** First letter + blanks for each word: "I w___ to s_____". */
function hintPattern(sentence: string): string {
  return sentence
    .split(/\s+/)
    .map((w) => {
      const m = /^([^A-Za-z0-9]*)([A-Za-z0-9])([A-Za-z0-9'’]*)(.*)$/.exec(w);
      return m ? `${m[1]}${m[2]}${"_".repeat(m[3]?.length ?? 0)}${m[4]}` : w;
    })
    .join(" ");
}

export function DictationMode({ session, onSession, onAgain }: { session: DictationSession; onSession: (s: DictationSession) => void; onAgain: () => void }) {
  const { t, fmt, err, lang } = usePrefs();
  const firstOpen = session.items.findIndex((i) => !i.locked);
  const [idx, setIdx] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [rate, setRate] = useState<number>(0.85);
  const [typed, setTyped] = useState("");
  const [lockText, setLockText] = useState("");
  const [diff, setDiff] = useState<WordDiffView | null>(null);
  const [lockDiff, setLockDiff] = useState<WordDiffView | null>(null);
  const [hint, setHint] = useState(false);
  const [showVi, setShowVi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plays, setPlays] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const item = session.items[idx];

  useEffect(() => {
    setTyped("");
    setLockText("");
    setDiff(null);
    setLockDiff(null);
    setHint(false);
    setShowVi(false);
    setError(null);
    setPlays(0);
  }, [idx]);

  const play = () => {
    if (!item) return;
    speakOnce(item.audio, rate);
    setPlays((p) => p + 1);
    input.current?.focus();
  };

  async function check() {
    if (!item || !typed.trim()) {
      setError(t.practice.emptyInput);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ diff: WordDiffView; locked: boolean; session: DictationSession }>("/api/practice", { action: "dictation.check", sessionId: session.id, index: idx, typed });
      setDiff(r.diff);
      onSession(r.session);
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  async function lockIn() {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ diff: WordDiffView; locked: boolean; session: DictationSession }>("/api/practice", { action: "dictation.lockin", sessionId: session.id, index: idx, typed: lockText });
      setLockDiff(r.diff);
      onSession(r.session);
      if (!r.locked) setError(t.practice.lockInFail);
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  const pattern = useMemo(() => (item ? hintPattern(item.audio) : ""), [item]);
  if (!item) return null;
  const current = session.items[idx] ?? item;
  const needsLockIn = current.checked && !current.locked;
  const allDone = session.items.every((i) => i.locked);
  const nextOpen = session.items.findIndex((i, k) => k > idx && !i.locked);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ItemDots items={session.items.map((i) => ({ done: i.locked }))} current={idx} onPick={setIdx} />
        <span className="num ml-auto text-[12.5px] text-ink-3">{fmt(t.practice.itemOf, { n: idx + 1, total: session.items.length })}</span>
      </div>

      <div className="rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={play} size="lg" variant="primary"><Volume2 aria-hidden /> {plays ? t.common.replay : t.practice.listen}</Button>
          <div role="radiogroup" aria-label={t.practice.speed} className="flex items-center rounded-full bg-surface p-0.5">
            {RATES.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={rate === r} onClick={() => setRate(r)} className={cn("num rounded-full px-2.5 py-1 text-[12px]", rate === r ? "bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-ink-3 hover:text-ink")}>{r}×</button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setHint(true)} disabled={hint}><Lightbulb aria-hidden /> {t.practice.hint}</Button>
          {lang === "vi" && <Button variant="ghost" size="sm" onClick={() => setShowVi(true)} disabled={showVi}><Eye aria-hidden /> {t.practice.showVi}</Button>}
        </div>
        {hint && <p className="mt-3 font-mono text-[14px] text-ink-2">{fmt(t.practice.hintWords, { n: pattern.split(" ").length, pattern })}</p>}
        {showVi && <p className="mt-2 text-[14px] text-ink-2">{item.vi}</p>}

        {!current.checked ? (
          <div className="mt-4">
            <textarea ref={input} value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={submitOnModEnter(() => void check())} onPaste={(e) => e.preventDefault()} rows={2} spellCheck={false} autoCorrect="off" autoCapitalize="off" placeholder={t.practice.typeHere} aria-label={t.practice.typeHere} className="w-full rounded-md border border-line bg-canvas px-3.5 py-3 font-serif text-[18px] outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/10" />
            <div className="mt-3 flex justify-end">
              <Button onClick={() => void check()} disabled={busy || plays === 0 || !typed.trim()}>{busy ? t.common.checking : t.common.check}</Button>
            </div>
          </div>
        ) : null}

        {diff && (
          <div className="mt-5 space-y-3 border-t border-line pt-4">
            <p className="num text-[13px] font-semibold">{fmt(t.practice.accuracy, { n: (diff.accuracy * 100).toFixed(0) })}</p>
            <WordDiffLine diff={diff} />
            {current.reveal && <p className="text-[14px]"><span className="font-medium text-ink-3">{t.practice.correctSentence}: </span><span className="font-serif text-[17px]">{current.reveal}</span></p>}
          </div>
        )}
        {current.checked && !diff && current.reveal && (
          <p className="mt-4 text-[14px]"><span className="font-medium text-ink-3">{t.practice.correctSentence}: </span><span className="font-serif text-[17px]">{current.reveal}</span></p>
        )}

        {needsLockIn && (
          <div className="mt-5 rounded-md border border-moderate/40 bg-moderate-wash p-4">
            <p className="text-[13.5px] font-medium text-moderate-ink">{t.practice.lockInTitle}</p>
            <textarea value={lockText} onChange={(e) => setLockText(e.target.value)} onKeyDown={submitOnModEnter(() => void lockIn())} onPaste={(e) => e.preventDefault()} rows={2} spellCheck={false} autoCorrect="off" className="mt-3 w-full rounded-md border border-line bg-card px-3.5 py-3 font-serif text-[17px] outline-none focus:border-accent/60" aria-label={t.practice.lockIn} />
            {lockDiff && !lockDiff.perfect && <WordDiffLine diff={lockDiff} className="mt-2" />}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={play}><RotateCcw aria-hidden /> {t.common.replay}</Button>
              <Button onClick={() => void lockIn()} disabled={busy || !lockText.trim()}>{t.practice.lockIn}</Button>
            </div>
          </div>
        )}
        {current.locked && <p className="mt-4 text-[13.5px] font-medium text-mastered-ink">{t.practice.perfect}</p>}
        {error && <p role="alert" className="mt-3 text-[13px] text-critical-ink">{error}</p>}
      </div>

      {current.locked && nextOpen >= 0 && (
        <div className="flex justify-end"><Button onClick={() => setIdx(nextOpen)}>{t.practice.next} →</Button></div>
      )}
      {allDone && <SessionDone score={session.score} onAgain={onAgain} />}
    </div>
  );
}

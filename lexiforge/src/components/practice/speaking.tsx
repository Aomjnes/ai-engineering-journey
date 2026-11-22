"use client";

import { useEffect, useState } from "react";
import { Mic, Volume2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/components/lf/prefs";
import { speakOnce, useSpeechToText } from "@/components/lesson/speech";
import { ItemDots, SessionDone, WordDiffLine, type SpeakingSession, type WordDiffView } from "./shared";

export function SpeakingMode({ session, onSession, onAgain }: { session: SpeakingSession; onSession: (s: SpeakingSession) => void; onAgain: () => void }) {
  const { t, fmt, err, pick } = usePrefs();
  const firstOpen = session.items.findIndex((i) => !i.passed);
  const [idx, setIdx] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [heard, setHeard] = useState<string | null>(null);
  const [result, setResult] = useState<{ diff: WordDiffView; passed: boolean; required: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = session.items[idx];

  const check = async (transcript: string) => {
    setHeard(transcript);
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ diff: WordDiffView; passed: boolean; required: number; session: SpeakingSession }>("/api/practice", { action: "speaking.check", sessionId: session.id, index: idx, transcript });
      setResult(r);
      onSession(r.session);
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  const stt = useSpeechToText((text) => {
    stt.stop();
    void check(text);
  });

  useEffect(() => {
    setHeard(null);
    setResult(null);
    setError(null);
  }, [idx]);

  if (!item) return null;
  const allDone = session.items.every((i) => i.passed);
  const nextOpen = session.items.findIndex((i, k) => k > idx && !i.passed);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ItemDots items={session.items.map((i) => ({ done: i.passed }))} current={idx} onPick={setIdx} />
        <span className="num ml-auto text-[12.5px] text-ink-3">{fmt(t.practice.itemOf, { n: idx + 1, total: session.items.length })}</span>
      </div>
      <div className="rounded-lg border border-line bg-card p-5">
        <p className="font-serif text-[26px] leading-snug text-ink">{item.text}</p>
        <p className="mt-2 font-mono text-[15px] text-accent-ink">{item.ipa}</p>
        <p className="mt-3 rounded-md bg-surface p-3 text-[14px] leading-relaxed text-ink-2">💡 {pick(item.tipEn, item.tipVi)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => speakOnce(item.text, 0.8)}><Volume2 aria-hidden /> {t.practice.hearIt}</Button>
          {stt.supported ? (
            <Button variant={stt.listening ? "danger" : "primary"} onClick={stt.listening ? stt.stop : stt.start} disabled={busy}>
              {stt.listening ? <span className="pulse-dot size-2 rounded-full bg-white" aria-hidden /> : <Mic aria-hidden />}
              {stt.listening ? t.practice.stopMic : t.practice.sayIt}
            </Button>
          ) : null}
        </div>
        {!stt.supported && <p className="mt-3 rounded-md border border-moderate/40 bg-moderate-wash p-3 text-[13px] text-moderate-ink">{t.practice.micFallback}</p>}
        {stt.error && <p className="mt-3 text-[13px] text-critical-ink">{fmt(t.practice.micError, { e: stt.error })}</p>}
        {heard && <p className="mt-4 text-[13.5px] text-ink-2">{fmt(t.practice.youSaid, { text: heard })}</p>}
        {result && (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <WordDiffLine diff={result.diff} />
            <p className={result.passed ? "text-[13.5px] font-medium text-mastered-ink" : "text-[13.5px] font-medium text-moderate-ink"}>
              {result.passed ? fmt(t.practice.speakPass, { n: (result.diff.accuracy * 100).toFixed(0) }) : fmt(t.practice.speakFail, { n: (result.diff.accuracy * 100).toFixed(0), req: (result.required * 100).toFixed(0) })}
            </p>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-[13px] text-critical-ink">{error}</p>}
      </div>
      {(session.items[idx]?.passed ?? false) && nextOpen >= 0 && <div className="flex justify-end"><Button onClick={() => setIdx(nextOpen)}>{t.practice.next} →</Button></div>}
      {allDone && <SessionDone score={session.score} onAgain={onAgain} />}
    </div>
  );
}

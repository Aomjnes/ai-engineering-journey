"use client";

import { useState } from "react";
import { Volume2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmt } from "@/lib/i18n";
import { usePrefs } from "@/components/lf/prefs";
import { countWords } from "@/lib/metrics/text";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DictateButton, submitOnModEnter } from "./common";

/** Stage-1 gate: listen to a hidden sentence, repeat it (STT or typing), ≥ 80% word accuracy. */
export function ShadowingCheck({ lessonId, sentence, ttsSupported, onPlay, onPassed }: { lessonId: string; sentence: string | null; ttsSupported: boolean; onPlay: () => void; onPassed: () => Promise<void> }) {
  const { t, err } = usePrefs();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; accuracy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    if (busy || countWords(text) < 3) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ passed: boolean; accuracy: number }>("/api/evaluate", { stage: "INPUT", lessonId, transcript: text });
      setResult(r);
      if (r.passed) await onPassed();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="eyebrow">{t.shadowing.eyebrow}</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{t.shadowing.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ttsSupported ? (
          <Button size="sm" variant="outline" onClick={onPlay}>
            <Volume2 aria-hidden /> {t.shadowing.play}
          </Button>
        ) : (
          <p className="text-[12.5px] text-moderate-ink">{fmt(t.shadowing.noTts, { s: sentence ?? "" })}</p>
        )}
        <DictateButton onText={(x) => setText((s) => `${s} ${x}`.trim())} />
      </div>
      <Textarea className="mt-3 font-serif text-[16px]" rows={3} value={text} onChange={(e) => setText(e.target.value)} onPaste={(e) => e.preventDefault()} onKeyDown={submitOnModEnter(() => void check())} placeholder={t.shadowing.placeholder} aria-label={t.shadowing.aria} />
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[12.5px]" role="status">
          {result && (result.passed ? <span className="tabular-nums text-mastered-ink">{fmt(t.shadowing.ok, { n: result.accuracy })}</span> : <span className="tabular-nums text-critical-ink">{fmt(t.shadowing.fail, { n: result.accuracy })}</span>)}
          {error && <span className="text-critical-ink">{error}</span>}
        </span>
        <Button size="sm" onClick={() => void check()} disabled={busy || countWords(text) < 3}>{busy ? t.common.checking : t.common.check}</Button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Volume2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { countWords } from "@/lib/metrics/text";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DictateButton, submitOnModEnter } from "./common";

/** Stage-1 gate: listen to a hidden sentence, repeat it (STT or typing), ≥ 80% word accuracy. */
export function ShadowingCheck({ lessonId, sentence, ttsSupported, onPlay, onPassed }: { lessonId: string; sentence: string | null; ttsSupported: boolean; onPlay: () => void; onPassed: () => Promise<void> }) {
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
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="eyebrow">Stage 1 gate · Shadowing</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">Read and listen first. Then play the hidden sentence and repeat it aloud — or type what you hear. 80% word accuracy unlocks Comprehension.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ttsSupported ? (
          <Button size="sm" variant="outline" onClick={onPlay}>
            <Volume2 aria-hidden /> Play hidden sentence
          </Button>
        ) : (
          <p className="text-[12.5px] text-moderate-ink">No speech synthesis in this browser. Shadow this sentence: “{sentence}”</p>
        )}
        <DictateButton onText={(t) => setText((s) => `${s} ${t}`.trim())} />
      </div>
      <Textarea className="mt-3 font-serif text-[16px]" rows={3} value={text} onChange={(e) => setText(e.target.value)} onPaste={(e) => e.preventDefault()} onKeyDown={submitOnModEnter(() => void check())} placeholder="What you heard…" aria-label="Shadowing transcript" />
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[12.5px]" role="status">
          {result && (result.passed ? <span className="tabular-nums text-mastered-ink">Accuracy {result.accuracy}% — Comprehension unlocked.</span> : <span className="tabular-nums text-critical-ink">Accuracy {result.accuracy}% — below 80%. Listen again.</span>)}
          {error && <span className="text-critical-ink">{error}</span>}
        </span>
        <Button size="sm" onClick={() => void check()} disabled={busy || countWords(text) < 3}>{busy ? "Checking…" : "Check"}</Button>
      </div>
    </div>
  );
}

"use client";

import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TtsState } from "@/components/lesson/speech";
import { fmt } from "@/lib/i18n";
import { usePrefs } from "./prefs";

export const SPEEDS = [0.8, 0.9, 1, 1.15] as const;

/** Floating audio/shadowing pill: play/pause, back one sentence (≈5 s), speed. Space toggles play. */
export function AudioShadowingBar({ state, rate, onRate, onToggle, onBack, onStop, position, total }: { state: TtsState; rate: number; onRate: (r: number) => void; onToggle: () => void; onBack: () => void; onStop: () => void; position: number | null; total: number }) {
  const { t } = usePrefs();
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-card/95 p-1 pr-2 shadow-lift backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <button type="button" onClick={onToggle} aria-label={state === "playing" ? t.audio.pause : t.audio.play} className="flex size-9 items-center justify-center rounded-full bg-ink text-canvas transition-opacity hover:opacity-90">
        {state === "playing" ? <Pause className="size-4" aria-hidden /> : <Play className="size-4 translate-x-[1px]" aria-hidden />}
      </button>
      <button type="button" onClick={onBack} aria-label={t.audio.back} title={t.audio.back} className="flex h-9 items-center gap-1 rounded-full px-2 text-[12px] text-ink-2 hover:bg-surface hover:text-ink">
        <RotateCcw className="size-3.5" aria-hidden />
        <span className="num">5s</span>
      </button>
      {state !== "idle" && (
        <button type="button" onClick={onStop} aria-label={t.audio.stop} className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface hover:text-ink">
          <Square className="size-3.5" aria-hidden />
        </button>
      )}
      <div role="radiogroup" aria-label={t.audio.rate} className="ml-1 flex items-center rounded-full bg-surface p-0.5">
        {SPEEDS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={rate === s} onClick={() => onRate(s)} className={cn("num rounded-full px-2 py-1 text-[11.5px] transition-colors", rate === s ? "bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-ink-3 hover:text-ink")}>
            {s}×
          </button>
        ))}
      </div>
      <span className="num ml-2 hidden text-[11px] text-ink-3 sm:inline">{position === null ? fmt(t.audio.sentences, { n: total }) : `${position + 1}/${total}`}</span>
    </div>
  );
}

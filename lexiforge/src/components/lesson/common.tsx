"use client";

import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeechToText } from "./speech";

/** Voice dictation (Web Speech STT) with an audio-pulse indicator while listening. */
export function DictateButton({ onText, className }: { onText: (t: string) => void; className?: string }) {
  const stt = useSpeechToText(onText);
  if (!stt.supported) return null;
  return (
    <button
      type="button"
      onClick={stt.listening ? stt.stop : stt.start}
      aria-pressed={stt.listening}
      aria-label={stt.listening ? "Stop dictation" : "Dictate with your voice"}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors",
        stt.listening ? "border-critical/40 bg-critical-wash text-critical-ink" : "border-line bg-card text-ink-2 hover:text-ink",
        className,
      )}
    >
      {stt.listening ? <span className="pulse-dot size-2 rounded-full bg-critical" aria-hidden /> : <Mic className="size-3.5" aria-hidden />}
      {stt.listening ? "Listening…" : "Dictate"}
    </button>
  );
}

/** Calls `fn` on ⌘/Ctrl + Enter inside a textarea/input. */
export function submitOnModEnter(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      fn();
    }
  };
}

export function ModEnterHint() {
  return (
    <span className="hidden items-center gap-1 text-[11.5px] text-ink-3 md:inline-flex">
      <kbd className="num rounded border border-line bg-surface px-1 text-[10.5px]">⌘/Ctrl</kbd>+<kbd className="num rounded border border-line bg-surface px-1 text-[10.5px]">Enter</kbd>
    </span>
  );
}

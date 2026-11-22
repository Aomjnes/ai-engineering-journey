"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { chunkPresent } from "@/lib/evaluation/chunks";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/i18n";
import { usePrefs } from "./prefs";

/**
 * Live chunk usage above the editor. Uses the same deterministic presence check as the server
 * (correct usage is still verified on submit).
 */
export function ChunkTrackerBar({ chunks, text, required }: { chunks: string[]; text: string; required: number }) {
  const { t } = usePrefs();
  const used = useMemo(() => chunks.map((c) => chunkPresent(text, c)), [chunks, text]);
  const n = used.filter(Boolean).length;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
      <span className={cn("num mr-1 text-[12px] font-semibold", n >= required ? "text-mastered-ink" : "text-ink-3")}>
        {fmt(t.chunks.used, { n: Math.min(n, chunks.length), req: required })}
      </span>
      {chunks.map((c, i) => (
        <span
          key={c}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12.5px] transition-[background-color,border-color,color] duration-200 ease-lf",
            used[i] ? "border-mastered/40 bg-mastered-wash text-mastered-ink" : "border-line bg-card text-ink-2",
          )}
        >
          {used[i] && <Check className="size-3" aria-hidden />}
          {c}
        </span>
      ))}
    </div>
  );
}

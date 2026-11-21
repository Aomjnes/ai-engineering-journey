"use client";

import { useMemo } from "react";
import { splitSentences, tokenize } from "@/lib/metrics/text";
import { cn } from "@/lib/utils";

const PLACEHOLDERS = new Set(["sb", "sth", "someone", "something", "somebody", "one's", "oneself"]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Display-only span finder for a chunk inside a sentence (tolerates inflection and short gaps). */
export function findChunkSpan(sentence: string, phrase: string): [number, number] | null {
  const direct = sentence.toLowerCase().indexOf(phrase.toLowerCase());
  if (direct >= 0) return [direct, direct + phrase.length];
  const toks = tokenize(phrase).filter((t) => !PLACEHOLDERS.has(t));
  if (toks.length === 0) return null;
  const parts = toks.map((t) => (t.length > 3 ? `${esc(t.slice(0, -1))}[\\w'’]*` : `${esc(t)}[\\w'’]*`));
  const re = new RegExp(`\\b${parts.join("(?:[^\\w]+[\\w'’]+){0,3}?[^\\w]+")}`, "i");
  const m = re.exec(sentence);
  return m ? [m.index, m.index + m[0].length] : null;
}

export interface ReadingChunk {
  id: string;
  phrase: string;
}

interface Props {
  text: string;
  chunks: ReadingChunk[];
  selected: string | null;
  speakingIndex: number | null;
  activeChunk: string | null;
  onSentence: (sentence: string, paragraph: string) => void;
  onChunk: (chunk: ReadingChunk, sentence: string) => void;
  onSelection: (selection: string, paragraph: string) => void;
  className?: string;
}

/**
 * Editorial article body. Every sentence is a target; lexical chunks carry a warm underline.
 * Clicking never scrolls the page; selections of any phrase open the inspector too.
 */
export function ReadingPane({ text, chunks, selected, speakingIndex, activeChunk, onSentence, onChunk, onSelection, className }: Props) {
  const paragraphs = useMemo(() => text.split(/\n{2,}/).map((p) => ({ text: p, sentences: splitSentences(p).map((s) => s.text) })), [text]);
  let globalIndex = -1;
  return (
    <div
      className={cn("reading measure text-ink", className)}
      onMouseUp={(e) => {
        const sel = window.getSelection()?.toString().trim() ?? "";
        if (sel.length >= 3 && sel.split(/\s+/).length <= 40) {
          const para = (e.target as HTMLElement).closest("p")?.textContent ?? sel;
          onSelection(sel, para);
        }
      }}
    >
      {paragraphs.map((p, pi) => (
        <p key={pi} className="mb-[1.1em]">
          {p.sentences.map((s) => {
            globalIndex++;
            const idx = globalIndex;
            const marks = chunks
              .map((c) => ({ c, span: findChunkSpan(s, c.phrase) }))
              .filter((x): x is { c: ReadingChunk; span: [number, number] } => x.span !== null)
              .sort((a, b) => a.span[0] - b.span[0]);
            const nodes: React.ReactNode[] = [];
            let cur = 0;
            for (const m of marks) {
              if (m.span[0] < cur) continue;
              if (m.span[0] > cur) nodes.push(s.slice(cur, m.span[0]));
              nodes.push(
                <span
                  key={m.c.id}
                  role="button"
                  tabIndex={0}
                  data-active={activeChunk === m.c.id}
                  className="chunk-mark"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!window.getSelection()?.toString()) onChunk(m.c, s);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onChunk(m.c, s);
                  }}
                >
                  {s.slice(m.span[0], m.span[1])}
                </span>,
              );
              cur = m.span[1];
            }
            if (cur < s.length) nodes.push(s.slice(cur));
            return (
              <span
                key={idx}
                role="button"
                tabIndex={0}
                aria-label={`Explain sentence ${idx + 1}`}
                data-selected={selected === s}
                data-speaking={speakingIndex === idx}
                className="sentence"
                onClick={() => {
                  if (!window.getSelection()?.toString()) onSentence(s, p.text);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSentence(s, p.text);
                }}
              >
                {nodes}{" "}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

/** Flat sentence list matching ReadingPane's global index order (for TTS highlight). */
export function sentencesOf(text: string): string[] {
  return text.split(/\n{2,}/).flatMap((p) => splitSentences(p).map((s) => s.text));
}

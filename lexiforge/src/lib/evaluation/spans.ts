import type { EvidenceError } from "./schemas";

export interface SpanRepairResult {
  errors: EvidenceError[];
  dropped: EvidenceError[];
  repaired: number;
}

function allIndexes(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return out;
}

/**
 * Verifies every LLM-reported span against the learner text. Wrong offsets are repaired to the
 * nearest exact occurrence (then case-insensitive). Errors whose text does not exist are dropped.
 * Duplicate spans (same range + subtype) are collapsed.
 */
export function repairSpans(text: string, errors: readonly EvidenceError[]): SpanRepairResult {
  const kept: EvidenceError[] = [];
  const dropped: EvidenceError[] = [];
  let repaired = 0;
  const seen = new Set<string>();
  for (const e of errors) {
    let fixed: EvidenceError | null = null;
    if (e.end > e.start && text.slice(e.start, e.end) === e.original) fixed = e;
    else {
      let candidates = allIndexes(text, e.original);
      let len = e.original.length;
      if (candidates.length === 0) {
        candidates = allIndexes(text.toLowerCase(), e.original.toLowerCase());
      }
      const trimmed = e.original.trim();
      if (candidates.length === 0 && trimmed !== e.original) {
        candidates = allIndexes(text, trimmed);
        len = trimmed.length;
      }
      if (candidates.length > 0) {
        const best = candidates.reduce((a, b) => (Math.abs(b - e.start) < Math.abs(a - e.start) ? b : a));
        fixed = { ...e, start: best, end: best + len, original: text.slice(best, best + len) };
        repaired++;
      }
    }
    if (!fixed) {
      dropped.push(e);
      continue;
    }
    const key = `${fixed.start}:${fixed.end}:${fixed.subtype}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(fixed);
  }
  kept.sort((a, b) => a.start - b.start);
  return { errors: kept, dropped, repaired };
}

export interface DiffSegment {
  type: "same" | "error";
  text: string;
  correction?: string;
  errorIndex?: number;
}

/** Builds an inline diff of the learner text from (non-overlapping-first-wins) error spans. */
export function buildInlineDiff(text: string, errors: readonly EvidenceError[]): DiffSegment[] {
  const segs: DiffSegment[] = [];
  let cursor = 0;
  errors.forEach((e, idx) => {
    if (e.start < cursor) return;
    if (e.start > cursor) segs.push({ type: "same", text: text.slice(cursor, e.start) });
    segs.push({ type: "error", text: text.slice(e.start, e.end), correction: e.correction, errorIndex: idx });
    cursor = e.end;
  });
  if (cursor < text.length) segs.push({ type: "same", text: text.slice(cursor) });
  return segs;
}

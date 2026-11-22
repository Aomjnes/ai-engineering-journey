/**
 * Deterministic proficiency math. Every formula here is documented in CLAUDE.md § Metric formulas
 * and covered by tests/metrics/*.test.ts. Pure functions only: no I/O, no LLM, time is a parameter.
 */

import { clamp, round, splitSentences, tokenize } from "./text";

// ───────────────────────────── Shared types ─────────────────────────────

export type Severity = "CRITICAL" | "MODERATE" | "MINOR";
export type ErrorCategory =
  | "GRAMMAR"
  | "COLLOCATION_NATURALNESS"
  | "WORD_CHOICE_REGISTER"
  | "SPELLING_PUNCTUATION"
  | "LOGIC_COMPREHENSION";

export const SEVERITY_WEIGHT: Record<Severity, number> = { CRITICAL: 3, MODERATE: 1.5, MINOR: 0.5 };

export interface ScoredError {
  start: number;
  end: number;
  category: ErrorCategory;
  subtype: string;
  severity: Severity;
}

const GRAMMAR_CATEGORIES: ReadonlySet<ErrorCategory> = new Set(["GRAMMAR", "SPELLING_PUNCTUATION"]);
const LEXICAL_CATEGORIES: ReadonlySet<ErrorCategory> = new Set(["COLLOCATION_NATURALNESS", "WORD_CHOICE_REGISTER"]);

const weightOf = (errors: readonly ScoredError[]) => errors.reduce((acc, e) => acc + SEVERITY_WEIGHT[e.severity], 0);

// ───────────────────────────── GAI ─────────────────────────────

/** Minimum word count used as the denominator for error density (protects 3–20 word beginner answers). */
export const SHORT_TEXT_FLOOR = 20;
/** Below this many tokens, lexical diversity blends from TTR toward Guiraud (R is unstable on tiny samples). */
export const GUIRAUD_MIN_TOKENS = 30;

export interface GaiResult {
  gai: number;
  words: number;
  weightedErrorsPer100W: number;
  rawErrorsPer100W: number;
  sentences: number;
  errorFreeSentences: number;
  efsr: number;
}

export function computeGai(text: string, errors: readonly ScoredError[]): GaiResult {
  const words = tokenize(text).length;
  const sentences = splitSentences(text);
  const counted = errors.filter((e) => GRAMMAR_CATEGORIES.has(e.category));
  // Short beginner answers: density uses at least SHORT_TEXT_FLOOR words so one slip in 5 words isn't "20 errors/100w".
  const e100 = (100 * weightOf(counted)) / Math.max(words, SHORT_TEXT_FLOOR);
  const raw100 = (100 * counted.length) / Math.max(words, 1);
  const erroneous = sentences.filter((s) => counted.some((e) => e.start < s.end && e.end > s.start)).length;
  const total = sentences.length;
  const errorFree = total - erroneous;
  const efsr = total === 0 ? 0 : errorFree / total;
  const density = 100 * Math.exp(-e100 / 10);
  const gai = words === 0 ? 0 : 0.6 * density + 0.4 * 100 * efsr;
  return {
    gai: round(clamp(gai, 0, 100)),
    words,
    weightedErrorsPer100W: round(e100),
    rawErrorsPer100W: round(raw100),
    sentences: total,
    errorFreeSentences: errorFree,
    efsr: round(efsr, 4),
  };
}

// ───────────────────────────── LRI ─────────────────────────────

/** Guiraud's Index (Root TTR): types / √tokens. Stable for short texts, unlike raw TTR. */
export function guiraudIndex(text: string): number {
  const tokens = tokenize(text).filter((t) => /^[a-z]/.test(t));
  if (tokens.length === 0) return 0;
  return new Set(tokens).size / Math.sqrt(tokens.length);
}

/**
 * Lexical diversity 0–100. Guiraud's R normalized as clamp((R − 3)/6); for short texts (n < 30 tokens)
 * blended with TTR, w = n/30: G = w·G_R + (1 − w)·100·clamp((TTR − 0.6)/0.4) — a 5-word answer can't reach R ≥ 3.
 */
export function diversityScore(text: string): number {
  const tokens = tokenize(text).filter((t) => /^[a-z]/.test(t));
  const n = tokens.length;
  if (n === 0) return 0;
  const gR = 100 * clamp((new Set(tokens).size / Math.sqrt(n) - 3) / 6, 0, 1);
  if (n >= GUIRAUD_MIN_TOKENS) return gR;
  const ttr = new Set(tokens).size / n;
  const gT = 100 * clamp((ttr - 0.6) / 0.4, 0, 1);
  const w = n / GUIRAUD_MIN_TOKENS;
  return w * gR + (1 - w) * gT;
}

export interface LriInput {
  text: string;
  errors: readonly ScoredError[];
  chunksRequired: number;
  chunksUsedCorrectly: number; // already intersected with deterministic presence
}

export interface LriResult {
  lri: number;
  cdr: number | null;
  guiraud: number;
  guiraudNorm: number;
  cnr: number;
}

export function computeLri({ text, errors, chunksRequired, chunksUsedCorrectly }: LriInput): LriResult {
  const words = tokenize(text).length;
  const r = guiraudIndex(text);
  const g = diversityScore(text);
  const lexWeight = weightOf(errors.filter((e) => LEXICAL_CATEGORIES.has(e.category)));
  const cnr = words === 0 ? 0 : 100 * clamp(1 - lexWeight / Math.max(words / 10, 1), 0, 1);
  let lri: number;
  let cdr: number | null = null;
  if (chunksRequired > 0) {
    cdr = 100 * clamp(chunksUsedCorrectly / chunksRequired, 0, 1);
    lri = 0.35 * cdr + 0.3 * g + 0.35 * cnr;
  } else {
    lri = (0.3 / 0.65) * g + (0.35 / 0.65) * cnr;
  }
  return { lri: round(words === 0 ? 0 : lri), cdr: cdr === null ? null : round(cdr), guiraud: round(r, 3), guiraudNorm: round(g), cnr: round(cnr) };
}

// ───────────────────────────── CPR ─────────────────────────────

export interface ComprehensionItemResult {
  criteriaMet: number;
  criteriaTotal: number;
  copyRejected: boolean;
  criticalLogicError: boolean;
  firstAttempt: boolean;
}

export function itemScore(item: ComprehensionItemResult): number {
  if (item.copyRejected || item.criticalLogicError || item.criteriaTotal <= 0) return 0;
  return clamp(item.criteriaMet / item.criteriaTotal, 0, 1);
}

/** Returns null when there are no first-attempt items (no evidence). */
export function computeCpr(items: readonly ComprehensionItemResult[]): number | null {
  const first = items.filter((i) => i.firstAttempt);
  if (first.length === 0) return null;
  return round((100 * first.reduce((acc, i) => acc + itemScore(i), 0)) / first.length);
}

// ───────────────────────────── RSS ─────────────────────────────

export interface ReviewRecord {
  elapsedDays: number;
  recalled: boolean;
}
export interface RetentionCard {
  stability: number;
  lastReviewAt: Date | null;
  state: string;
}

export interface RssResult {
  rss: number | null;
  r7: number | null;
  r30: number | null;
  current: number | null;
  matureReviews: number;
}

const DAY_MS = 86_400_000;

function laplace(records: readonly ReviewRecord[]): number | null {
  if (records.length === 0) return null;
  return (records.filter((r) => r.recalled).length + 1) / (records.length + 2);
}

export function computeRss(reviews: readonly ReviewRecord[], cards: readonly RetentionCard[], now: Date, retrievabilityFn: (t: number, s: number) => number): RssResult {
  const b7 = reviews.filter((r) => r.elapsedDays >= 7 && r.elapsedDays < 30);
  const b30 = reviews.filter((r) => r.elapsedDays >= 30);
  const r7 = laplace(b7);
  const r30 = laplace(b30);
  const active = cards.filter((c) => c.state !== "NEW" && c.lastReviewAt !== null && c.stability > 0);
  const current =
    active.length === 0
      ? null
      : active.reduce((acc, c) => acc + retrievabilityFn((now.getTime() - (c.lastReviewAt as Date).getTime()) / DAY_MS, c.stability), 0) / active.length;
  let hist: number | null = null;
  if (r7 !== null && r30 !== null) hist = 0.4 * r7 + 0.6 * r30;
  else hist = r7 ?? r30;
  let rss: number | null = null;
  if (current !== null && hist !== null) rss = 100 * (0.5 * hist + 0.5 * current);
  else if (current !== null) rss = 100 * current;
  else if (hist !== null) rss = 100 * hist;
  return {
    rss: rss === null ? null : round(rss),
    r7: r7 === null ? null : round(r7, 4),
    r30: r30 === null ? null : round(r30, 4),
    current: current === null ? null : round(current, 4),
    matureReviews: b7.length + b30.length,
  };
}

// ───────────────────────────── ERI & half-life ─────────────────────────────

export interface ProductionSession {
  at: Date;
  words: number;
  errors: ReadonlyArray<Pick<ScoredError, "subtype" | "severity">>;
}

export interface EriResult {
  eri: number | null;
  recurrenceDensity: number;
  recurringSubtypes: Record<string, number>; // subtype → recurrences in window
}

/** ERI over the 14 days before `now`. Sessions in any order. Null with < 2 sessions (no recurrence evidence). */
export function computeEri(sessions: readonly ProductionSession[], now: Date, windowDays = 14): EriResult {
  const ordered = [...sessions].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (ordered.length < 2) return { eri: null, recurrenceDensity: 0, recurringSubtypes: {} };
  const seen = new Set<string>();
  const windowStart = now.getTime() - windowDays * DAY_MS;
  let windowWords = 0;
  let recWeight = 0;
  const recurring: Record<string, number> = {};
  for (const s of ordered) {
    const inWindow = s.at.getTime() >= windowStart && s.at.getTime() <= now.getTime();
    if (inWindow) windowWords += s.words;
    const newThisSession = new Set<string>();
    for (const e of s.errors) {
      if (seen.has(e.subtype)) {
        if (inWindow) {
          recWeight += SEVERITY_WEIGHT[e.severity];
          recurring[e.subtype] = (recurring[e.subtype] ?? 0) + 1;
        }
      } else newThisSession.add(e.subtype);
    }
    for (const st of newThisSession) seen.add(st);
  }
  if (windowWords === 0) return { eri: null, recurrenceDensity: 0, recurringSubtypes: recurring };
  const density = (100 * recWeight) / windowWords;
  return { eri: round(100 * Math.exp(-density / 4)), recurrenceDensity: round(density), recurringSubtypes: recurring };
}

/**
 * Error half-life (days) for one subtype: least-squares slope of ln(rate + 0.5) over time.
 * Returns null with < 3 sessions, Infinity when the error is not decaying.
 */
export function errorHalfLife(sessions: readonly ProductionSession[], subtype: string): number | null {
  const ordered = [...sessions].filter((s) => s.words > 0).sort((a, b) => a.at.getTime() - b.at.getTime());
  if (ordered.length < 3) return null;
  const t0 = ordered[0]?.at.getTime() ?? 0;
  const xs = ordered.map((s) => (s.at.getTime() - t0) / DAY_MS);
  const ys = ordered.map((s) => {
    const w = s.errors.filter((e) => e.subtype === subtype).reduce((acc, e) => acc + SEVERITY_WEIGHT[e.severity], 0);
    return Math.log((100 * w) / s.words + 0.5);
  });
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += ((xs[i] ?? 0) - mx) * ((ys[i] ?? 0) - my);
    den += ((xs[i] ?? 0) - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  if (slope >= 0) return Infinity;
  return round(Math.LN2 / -slope, 2);
}

export const RECURRENCE_CEILING = 2;

/** ERI gate: in the last 5 sessions, no subtype at CRITICAL severity in more than RECURRENCE_CEILING sessions. */
export function eriGate(sessions: readonly ProductionSession[]): { passes: boolean; offending: string[] } {
  const last5 = [...sessions].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 5);
  const counts = new Map<string, number>();
  for (const s of last5) {
    const crit = new Set(s.errors.filter((e) => e.severity === "CRITICAL").map((e) => e.subtype));
    for (const st of crit) counts.set(st, (counts.get(st) ?? 0) + 1);
  }
  const offending = [...counts.entries()].filter(([, c]) => c > RECURRENCE_CEILING).map(([st]) => st).sort();
  return { passes: offending.length === 0, offending };
}

// ───────────────────────────── Composite ─────────────────────────────

export interface MetricVector {
  gai: number | null;
  lri: number | null;
  cpr: number | null;
  rss: number | null;
  eri: number | null;
}

export const COMPOSITE_WEIGHTS = { gai: 0.3, lri: 0.25, cpr: 0.2, rss: 0.15, eri: 0.1 } as const;

/** Weighted composite, renormalized over dimensions with evidence. Null if nothing has evidence. */
export function compositeScore(m: MetricVector): number | null {
  let sum = 0;
  let wsum = 0;
  for (const key of Object.keys(COMPOSITE_WEIGHTS) as Array<keyof MetricVector>) {
    const v = m[key];
    if (v === null) continue;
    sum += COMPOSITE_WEIGHTS[key] * v;
    wsum += COMPOSITE_WEIGHTS[key];
  }
  return wsum === 0 ? null : round(sum / wsum);
}

// ───────────────────────────── Bands & IELTS ─────────────────────────────

/**
 * Level scale L ∈ [0, 100] with 11 sub-bands from absolute beginner to near-native.
 * Lower bounds (inclusive): Pre-A1 0 · A1.1 15 · A1.2 25 · A2.1 34 · A2.2 44 · B1.1 53 · B1.2 61 ·
 * B2.1 69 · B2.2 76 · C1.1 83 · C1.2 90. Task/article difficulty D uses the same scale.
 */
export const SUB_BANDS = ["PRE_A1", "A1_1", "A1_2", "A2_1", "A2_2", "B1_1", "B1_2", "B2_1", "B2_2", "C1_1", "C1_2"] as const;
export type SubBand = (typeof SUB_BANDS)[number];

export const BAND_LOWER: Record<SubBand, number> = {
  PRE_A1: 0, A1_1: 15, A1_2: 25, A2_1: 34, A2_2: 44, B1_1: 53, B1_2: 61, B2_1: 69, B2_2: 76, C1_1: 83, C1_2: 90,
};

export const QUALIFYING_THRESHOLD: Record<SubBand, number> = {
  PRE_A1: 54, A1_1: 56, A1_2: 58, A2_1: 60, A2_2: 63, B1_1: 66, B1_2: 69, B2_1: 72, B2_2: 75, C1_1: 78, C1_2: 81,
};

export function bandLabel(b: SubBand): string {
  return b === "PRE_A1" ? "Pre-A1" : b.replace("_", ".");
}

export function isSubBand(v: string): v is SubBand {
  return (SUB_BANDS as readonly string[]).includes(v);
}

export function bandIndex(b: SubBand): number {
  return SUB_BANDS.indexOf(b);
}

export function bandFromLevel(level: number): SubBand {
  const l = clamp(level, 0, 100);
  let found: SubBand = "PRE_A1";
  for (const b of SUB_BANDS) if (l >= BAND_LOWER[b]) found = b;
  return found;
}

export function bandLowerBound(b: SubBand): number {
  return BAND_LOWER[b];
}

/** Exclusive upper bound (100 for the top band). */
export function bandUpperBound(b: SubBand): number {
  const next = SUB_BANDS[bandIndex(b) + 1];
  return next ? BAND_LOWER[next] : 100;
}

export function bandWidth(b: SubBand): number {
  return bandUpperBound(b) - bandLowerBound(b);
}

export function bandMidpoint(b: SubBand): number {
  return (bandLowerBound(b) + bandUpperBound(b)) / 2;
}

export function nextBand(b: SubBand): SubBand | null {
  return SUB_BANDS[bandIndex(b) + 1] ?? null;
}

export function previousBand(b: SubBand): SubBand | null {
  const i = bandIndex(b);
  return i <= 0 ? null : (SUB_BANDS[i - 1] as SubBand);
}

/** True for Pre-A1, A1.1, A1.2 — the beginner track (micro stories, word banks, simplified feedback). */
export function isBeginnerBand(b: SubBand): boolean {
  return bandIndex(b) <= bandIndex("A1_2");
}

export function roundHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

export const IELTS_FLOOR = 2.5; // displayed as "< 3.0"
const IELTS_BY_BAND: Record<SubBand, number | [number, number]> = {
  PRE_A1: IELTS_FLOOR, A1_1: 3, A1_2: 3.5, A2_1: 4, A2_2: 4.5, B1_1: 5, B1_2: 5.5, B2_1: 6, B2_2: 6.5, C1_1: [7, 7.5], C1_2: [8, 8.5],
};

/** Stepwise band → IELTS mapping; C1 sub-bands split their range at the band midpoint. */
export function ieltsFromLevel(level: number): number {
  const b = bandFromLevel(level);
  const v = IELTS_BY_BAND[b];
  if (typeof v === "number") return v;
  return clamp(level, 0, 100) < bandMidpoint(b) ? v[0] : v[1];
}

export interface IeltsEstimate {
  band: number;
  low: number;
  high: number;
  halfWidth: number;
}

export function ieltsEstimate(level: number, evidenceWords: number, evidenceItems: number): IeltsEstimate {
  const band = ieltsFromLevel(level);
  const se = 1 / Math.sqrt(1 + evidenceWords / 150 + evidenceItems / 10);
  const half = Math.max(0.5, roundHalf(1.96 * se));
  return { band, low: clamp(band - half, IELTS_FLOOR, 8.5), high: clamp(band + half, IELTS_FLOOR, 8.5), halfWidth: half };
}

// ───────────────────────────── Difficulty-adjusted EWMA ─────────────────────────────

export const LEVEL_ALPHA = 0.25;
export const METRIC_ALPHA = 0.3;
export const PASS_MARK = 70;

export function impliedLevel(taskDifficulty: number, performance: number): number {
  return clamp(taskDifficulty + 0.5 * (performance - PASS_MARK), 0, 100);
}

export function difficultyMultiplier(level: number, taskDifficulty: number, performance: number): number {
  const passedAbove = taskDifficulty > level && performance >= PASS_MARK;
  const failedBelow = taskDifficulty < level && performance < PASS_MARK;
  return passedAbove || failedBelow ? 1 + Math.min(Math.abs(taskDifficulty - level) / 25, 1) : 1;
}

export function updateLevel(level: number, taskDifficulty: number, performance: number): number {
  const target = impliedLevel(taskDifficulty, performance);
  const m = difficultyMultiplier(level, taskDifficulty, performance);
  return round(clamp(level + LEVEL_ALPHA * m * (target - level), 0, 100), 3);
}

export function ewma(previous: number | null, observation: number | null, alpha = METRIC_ALPHA): number | null {
  if (observation === null) return previous;
  if (previous === null) return round(observation);
  return round(previous + alpha * (observation - previous));
}

// ───────────────────────────── Promotion lock, decay, demotion ─────────────────────────────

export const REQUIRED_CONSECUTIVE = 5;
export const RSS_PROMOTION_FLOOR = 60;

export function sessionQualifies(band: SubBand, sessionComposite: number, taskDifficulty: number, passedRepairGateFirstTry: boolean): boolean {
  return sessionComposite >= QUALIFYING_THRESHOLD[band] && taskDifficulty >= bandLowerBound(band) && passedRepairGateFirstTry;
}

export function nextConsecutive(current: number, qualifies: boolean): number {
  return qualifies ? current + 1 : 0;
}

export interface PromotionInput {
  band: SubBand;
  consecutiveQualifying: number;
  eriGatePasses: boolean;
  eriOffending: string[];
  rss: number | null;
}

export interface PromotionStatus {
  unlocked: boolean;
  atCeiling: boolean;
  unmet: string[];
}

export function promotionStatus(p: PromotionInput): PromotionStatus {
  if (nextBand(p.band) === null) return { unlocked: false, atCeiling: true, unmet: ["Already at C1.2 — the top tracked sub-band."] };
  const unmet: string[] = [];
  if (p.consecutiveQualifying < REQUIRED_CONSECUTIVE) {
    unmet.push(
      `Qualifying sessions: ${p.consecutiveQualifying}/${REQUIRED_CONSECUTIVE} consecutive at composite ≥ ${QUALIFYING_THRESHOLD[p.band]} on ≥ ${bandLabel(p.band)} material.`,
    );
  }
  if (!p.eriGatePasses) unmet.push(`Recurring critical errors above ceiling: ${p.eriOffending.join(", ")}.`);
  if (p.rss !== null && p.rss < RSS_PROMOTION_FLOOR) unmet.push(`Retention Stability ${p.rss} < ${RSS_PROMOTION_FLOOR}.`);
  return { unlocked: unmet.length === 0, atCeiling: false, unmet };
}

export function promotionAuditPasses(targetBand: SubBand, auditComposite: number, criticalErrors: number): boolean {
  return auditComposite >= QUALIFYING_THRESHOLD[targetBand] && criticalErrors === 0;
}

export const INACTIVITY_GRACE_DAYS = 7;
export const DECAY_PER_DAY = 0.5;

/** Level after inactivity decay. `daysAlreadyDecayed` prevents double-applying on repeated loads. */
export function inactivityDecay(level: number, lastActivity: Date, now: Date, daysAlreadyDecayed: number): { level: number; newlyDecayedDays: number } {
  const idleDays = Math.floor((now.getTime() - lastActivity.getTime()) / DAY_MS);
  const decayDays = Math.max(0, idleDays - INACTIVITY_GRACE_DAYS);
  const fresh = Math.max(0, decayDays - daysAlreadyDecayed);
  return { level: round(clamp(level - fresh * DECAY_PER_DAY, 0, 100), 3), newlyDecayedDays: fresh };
}

export function demotionCheck(band: SubBand, level: number): SubBand {
  const prev = previousBand(band);
  if (prev && level < bandLowerBound(band) - bandWidth(prev) / 2) return prev;
  return band;
}

// ───────────────────────────── Error-Repair Gate ─────────────────────────────

export interface RepairGate {
  blocked: boolean;
  critical: number;
  moderate: number;
  reason: string | null;
}

/** Blocks progression on any CRITICAL error or ≥ 2 MODERATE errors. */
export function repairGate(errors: ReadonlyArray<Pick<ScoredError, "severity">>): RepairGate {
  const critical = errors.filter((e) => e.severity === "CRITICAL").length;
  const moderate = errors.filter((e) => e.severity === "MODERATE").length;
  const blocked = critical > 0 || moderate >= 2;
  const reason = !blocked
    ? null
    : critical > 0
      ? `${critical} critical error${critical > 1 ? "s" : ""} must be repaired before you continue.`
      : `${moderate} moderate errors must be repaired before you continue.`;
  return { blocked, critical, moderate, reason };
}

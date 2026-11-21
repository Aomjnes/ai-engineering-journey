import { describe, expect, it } from "vitest";
import {
  bandFromLevel,
  compositeScore,
  computeCpr,
  computeEri,
  computeGai,
  computeLri,
  computeRss,
  demotionCheck,
  difficultyMultiplier,
  errorHalfLife,
  eriGate,
  ewma,
  ieltsEstimate,
  ieltsFromLevel,
  impliedLevel,
  inactivityDecay,
  nextConsecutive,
  promotionAuditPasses,
  promotionStatus,
  repairGate,
  sessionQualifies,
  updateLevel,
  type ProductionSession,
  type ScoredError,
} from "@/lib/metrics/scoring";
import { retrievability } from "@/lib/metrics/srs";

const DAY = 86_400_000;
const NOW = new Date("2026-03-01T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

// 20 words, 2 sentences
const TEXT = "Yesterday I go to the market with my sister. We buyed many fresh vegetable and some fruit for the week.";
const span = (needle: string): { start: number; end: number } => {
  const start = TEXT.indexOf(needle);
  return { start, end: start + needle.length };
};
const err = (needle: string, severity: ScoredError["severity"], category: ScoredError["category"] = "GRAMMAR", subtype = "TENSE_SHIFT"): ScoredError => ({
  ...span(needle),
  severity,
  category,
  subtype,
});

describe("GAI", () => {
  it("is 100 for an error-free text", () => {
    const r = computeGai(TEXT, []);
    expect(r.gai).toBe(100);
    expect(r.efsr).toBe(1);
    expect(r.weightedErrorsPer100W).toBe(0);
  });

  it("matches the exact formula with mixed severities", () => {
    const errors = [err("go", "CRITICAL"), err("buyed", "MODERATE"), err("vegetable", "MINOR", "GRAMMAR", "PLURAL_OMISSION")];
    const r = computeGai(TEXT, errors);
    const words = 20;
    const e100 = (100 * (3 + 1.5 + 0.5)) / words; // 25
    const expected = 0.6 * 100 * Math.exp(-e100 / 10) + 0.4 * 100 * 0; // both sentences erroneous
    expect(r.words).toBe(words);
    expect(r.weightedErrorsPer100W).toBe(25);
    expect(r.errorFreeSentences).toBe(0);
    expect(r.gai).toBeCloseTo(expected, 2);
  });

  it("ignores lexical/logic categories (those belong to LRI/CPR)", () => {
    const r = computeGai(TEXT, [err("fresh", "CRITICAL", "COLLOCATION_NATURALNESS", "CALQUE")]);
    expect(r.gai).toBe(100);
  });

  it("heavy critical errors drive GAI toward zero", () => {
    const short = "He go school yesterday and he no like it.";
    const errors: ScoredError[] = [
      { start: 3, end: 5, category: "GRAMMAR", subtype: "TENSE_SHIFT", severity: "CRITICAL" },
      { start: 6, end: 12, category: "GRAMMAR", subtype: "PREPOSITION_OMISSION", severity: "CRITICAL" },
      { start: 30, end: 37, category: "GRAMMAR", subtype: "NEGATION", severity: "CRITICAL" },
    ];
    expect(computeGai(short, errors).gai).toBeLessThan(5);
  });

  it("returns 0 for empty text and counts per-sentence correctly on short text", () => {
    expect(computeGai("", []).gai).toBe(0);
    const r = computeGai("I like tea. She like coffee.", [{ start: 16, end: 20, category: "GRAMMAR", subtype: "SV_AGREEMENT", severity: "MODERATE" }]);
    expect(r.sentences).toBe(2);
    expect(r.errorFreeSentences).toBe(1);
  });
});

describe("LRI", () => {
  it("uses Guiraud and renormalizes when no chunks are required", () => {
    const r = computeLri({ text: TEXT, errors: [], chunksRequired: 0, chunksUsedCorrectly: 0 });
    expect(r.cdr).toBeNull();
    expect(r.cnr).toBe(100);
    const expected = (0.3 / 0.65) * r.guiraudNorm + (0.35 / 0.65) * 100;
    expect(r.lri).toBeCloseTo(expected, 1);
  });

  it("weights chunk deployment and penalizes unnatural collocations", () => {
    const base = computeLri({ text: TEXT, errors: [], chunksRequired: 3, chunksUsedCorrectly: 3 });
    const worse = computeLri({
      text: TEXT,
      errors: [err("fresh", "MODERATE", "COLLOCATION_NATURALNESS", "CALQUE")],
      chunksRequired: 3,
      chunksUsedCorrectly: 1,
    });
    expect(base.cdr).toBe(100);
    expect(worse.cdr).toBeCloseTo(33.33, 1);
    // W=20 → W/10=2; CNR = 100·(1 − 1.5/2) = 25
    expect(worse.cnr).toBe(25);
    expect(worse.lri).toBeLessThan(base.lri);
  });

  it("a repetitive text has a lower Guiraud index", () => {
    const rep = computeLri({ text: "good good good good good good good good good", errors: [], chunksRequired: 0, chunksUsedCorrectly: 0 });
    expect(rep.guiraud).toBeCloseTo(1 / 3, 3);
    expect(rep.guiraudNorm).toBe(0);
  });
});

describe("CPR", () => {
  it("averages first-attempt rubric scores; copy-paste and critical logic score 0", () => {
    const cpr = computeCpr([
      { criteriaMet: 3, criteriaTotal: 3, copyRejected: false, criticalLogicError: false, firstAttempt: true },
      { criteriaMet: 1, criteriaTotal: 2, copyRejected: false, criticalLogicError: false, firstAttempt: true },
      { criteriaMet: 3, criteriaTotal: 3, copyRejected: true, criticalLogicError: false, firstAttempt: true },
      { criteriaMet: 2, criteriaTotal: 2, copyRejected: false, criticalLogicError: true, firstAttempt: true },
      { criteriaMet: 2, criteriaTotal: 2, copyRejected: false, criticalLogicError: false, firstAttempt: false },
    ]);
    expect(cpr).toBe(37.5);
  });
  it("is null without first-attempt evidence", () => {
    expect(computeCpr([])).toBeNull();
  });
});

describe("RSS", () => {
  it("combines Laplace bucket rates with current retrievability", () => {
    const reviews = [
      { elapsedDays: 8, recalled: true },
      { elapsedDays: 10, recalled: false },
      { elapsedDays: 35, recalled: true },
    ];
    const cards = [{ stability: 10, lastReviewAt: daysAgo(10), state: "REVIEW" }];
    const r = computeRss(reviews, cards, NOW, retrievability);
    const r7 = (1 + 1) / (2 + 2);
    const r30 = (1 + 1) / (1 + 2);
    const hist = 0.4 * r7 + 0.6 * r30;
    const cur = retrievability(10, 10);
    expect(r.rss).toBeCloseTo(100 * (0.5 * hist + 0.5 * cur), 2);
    expect(r.matureReviews).toBe(3);
  });

  it("decays honestly when reviews are missed", () => {
    const cards = [{ stability: 5, lastReviewAt: daysAgo(5), state: "REVIEW" }];
    const fresh = computeRss([], cards, NOW, retrievability).rss ?? 0;
    const later = computeRss([], cards, new Date(NOW.getTime() + 40 * DAY), retrievability).rss ?? 0;
    expect(later).toBeLessThan(fresh);
    expect(fresh).toBeCloseTo(90, 0);
  });

  it("is null with no reviewed cards", () => {
    expect(computeRss([], [{ stability: 0, lastReviewAt: null, state: "NEW" }], NOW, retrievability).rss).toBeNull();
  });
});

describe("ERI, half-life, ERI gate", () => {
  const session = (d: number, words: number, subtypes: Array<[string, ScoredError["severity"]]>): ProductionSession => ({
    at: daysAgo(d),
    words,
    errors: subtypes.map(([subtype, severity]) => ({ subtype, severity })),
  });

  it("counts only recurrences (subtype seen in an earlier session) inside the window", () => {
    const sessions = [
      session(20, 100, [["ARTICLE_OMISSION", "MODERATE"]]),
      session(10, 100, [["ARTICLE_OMISSION", "MODERATE"], ["TENSE_SHIFT", "CRITICAL"]]),
      session(2, 100, [["TENSE_SHIFT", "CRITICAL"]]),
    ];
    const r = computeEri(sessions, NOW);
    // window (14d): sessions at 10d and 2d → 200 words; recurrences: ARTICLE (1.5) + TENSE at 2d (3) = 4.5
    expect(r.recurrenceDensity).toBe(2.25);
    expect(r.eri).toBeCloseTo(100 * Math.exp(-2.25 / 4), 1);
    expect(r.recurringSubtypes).toEqual({ ARTICLE_OMISSION: 1, TENSE_SHIFT: 1 });
  });

  it("is 100 when nothing recurs, null with fewer than 2 sessions", () => {
    expect(computeEri([session(3, 80, [["A", "MINOR"]]), session(1, 80, [["B", "MINOR"]])], NOW).eri).toBe(100);
    expect(computeEri([session(1, 80, [])], NOW).eri).toBeNull();
  });

  it("half-life is finite for a decaying error and infinite for a growing one", () => {
    const decaying = [session(30, 100, Array(6).fill(["ARTICLE_OMISSION", "MODERATE"])), session(20, 100, Array(3).fill(["ARTICLE_OMISSION", "MODERATE"])), session(10, 100, [["ARTICLE_OMISSION", "MODERATE"]]), session(0, 100, [])];
    const hl = errorHalfLife(decaying, "ARTICLE_OMISSION");
    expect(hl).not.toBeNull();
    expect(Number.isFinite(hl as number)).toBe(true);
    expect(hl as number).toBeGreaterThan(0);
    const growing = [session(20, 100, []), session(10, 100, [["X", "MINOR"]]), session(0, 100, [["X", "CRITICAL"], ["X", "CRITICAL"]])];
    expect(errorHalfLife(growing, "X")).toBe(Infinity);
    expect(errorHalfLife(growing.slice(0, 2), "X")).toBeNull();
  });

  it("gate blocks a critical subtype recurring in > 2 of the last 5 sessions", () => {
    const s = [1, 2, 3, 4, 5].map((d) => session(d, 100, d <= 3 ? [["TENSE_SHIFT", "CRITICAL"]] : []));
    expect(eriGate(s)).toEqual({ passes: false, offending: ["TENSE_SHIFT"] });
    const ok = [1, 2, 3, 4, 5].map((d) => session(d, 100, d <= 2 ? [["TENSE_SHIFT", "CRITICAL"]] : [["TENSE_SHIFT", "MODERATE"]]));
    expect(eriGate(ok).passes).toBe(true);
    // only the 5 most recent sessions count
    const old = [...[1, 2, 3, 4, 5].map((d) => session(d, 100, [])), ...[10, 11, 12].map((d) => session(d, 100, [["TENSE_SHIFT", "CRITICAL"]]))];
    expect(eriGate(old).passes).toBe(true);
  });
});

describe("composite, bands, IELTS", () => {
  it("renormalizes over available dimensions", () => {
    expect(compositeScore({ gai: 80, lri: 60, cpr: 70, rss: 90, eri: 100 })).toBeCloseTo(0.3 * 80 + 0.25 * 60 + 0.2 * 70 + 0.15 * 90 + 0.1 * 100, 5);
    expect(compositeScore({ gai: 80, lri: 60, cpr: null, rss: null, eri: null })).toBeCloseTo((0.3 * 80 + 0.25 * 60) / 0.55, 2);
    expect(compositeScore({ gai: null, lri: null, cpr: null, rss: null, eri: null })).toBeNull();
  });

  it("maps level to sub-bands at exact boundaries", () => {
    expect(bandFromLevel(0)).toBe("A2_1");
    expect(bandFromLevel(12.49)).toBe("A2_1");
    expect(bandFromLevel(12.5)).toBe("A2_2");
    expect(bandFromLevel(37.5)).toBe("B1_2");
    expect(bandFromLevel(87.5)).toBe("C1_2");
    expect(bandFromLevel(100)).toBe("C1_2");
    expect(bandFromLevel(-5)).toBe("A2_1");
  });

  it("maps IELTS piecewise-linearly in 0.5 steps within 4.0–8.5", () => {
    expect(ieltsFromLevel(0)).toBe(4);
    expect(ieltsFromLevel(50)).toBe(5.5);
    expect(ieltsFromLevel(62.5)).toBe(6.5); // 6.25 → 6.5
    expect(ieltsFromLevel(75)).toBe(7);
    expect(ieltsFromLevel(100)).toBe(8.5);
    for (let l = 0; l <= 100; l += 0.5) {
      const v = ieltsFromLevel(l);
      expect(v * 2).toBe(Math.round(v * 2));
      expect(v).toBeGreaterThanOrEqual(4);
      expect(v).toBeLessThanOrEqual(8.5);
    }
  });

  it("confidence interval narrows with evidence", () => {
    const thin = ieltsEstimate(50, 100, 4);
    const thick = ieltsEstimate(50, 3000, 60);
    expect(thin.halfWidth).toBeGreaterThan(thick.halfWidth);
    expect(thick.halfWidth).toBe(0.5);
    expect(thin.low).toBeGreaterThanOrEqual(4);
  });
});

describe("difficulty-adjusted EWMA", () => {
  it("implied level centers on task difficulty at the pass mark", () => {
    expect(impliedLevel(50, 70)).toBe(50);
    expect(impliedLevel(50, 90)).toBe(60);
    expect(impliedLevel(10, 0)).toBe(0);
  });

  it("passing a B2 task moves a B1 learner up faster than passing a B1 task", () => {
    const b1 = 40;
    const upB2 = updateLevel(b1, 56, 78) - b1;
    const upB1 = updateLevel(b1, 40, 78) - b1;
    expect(difficultyMultiplier(b1, 56, 78)).toBeGreaterThan(1);
    expect(upB2).toBeGreaterThan(upB1);
  });

  it("failing an A2 task pulls a B2 learner down sharply", () => {
    const b2 = 58;
    const after = updateLevel(b2, 10, 30);
    expect(difficultyMultiplier(b2, 10, 30)).toBe(2);
    expect(b2 - after).toBeGreaterThan(20);
  });

  it("plain EWMA for metrics handles missing evidence", () => {
    expect(ewma(null, 80)).toBe(80);
    expect(ewma(50, null)).toBe(50);
    expect(ewma(50, 100)).toBe(65);
  });
});

describe("promotion lock, decay, repair gate", () => {
  it("a session qualifies only at threshold, at-level difficulty, and first-try gate pass", () => {
    expect(sessionQualifies("B1_1", 66, 25, true)).toBe(true);
    expect(sessionQualifies("B1_1", 65.9, 25, true)).toBe(false);
    expect(sessionQualifies("B1_1", 90, 24, true)).toBe(false); // too-easy material
    expect(sessionQualifies("B1_1", 90, 30, false)).toBe(false);
    expect(nextConsecutive(4, true)).toBe(5);
    expect(nextConsecutive(4, false)).toBe(0); // one-off spikes cannot accumulate
  });

  it("lists every unmet lock condition", () => {
    const s = promotionStatus({ band: "B1_2", consecutiveQualifying: 3, eriGatePasses: false, eriOffending: ["TENSE_SHIFT"], rss: 50 });
    expect(s.unlocked).toBe(false);
    expect(s.unmet).toHaveLength(3);
    expect(promotionStatus({ band: "B1_2", consecutiveQualifying: 5, eriGatePasses: true, eriOffending: [], rss: null }).unlocked).toBe(true);
  });

  it("recurring-error block holds even with 5 qualifying sessions", () => {
    const s = promotionStatus({ band: "B2_1", consecutiveQualifying: 7, eriGatePasses: false, eriOffending: ["ARTICLE_OMISSION"], rss: 80 });
    expect(s.unlocked).toBe(false);
    expect(s.unmet[0]).toContain("ARTICLE_OMISSION");
  });

  it("C1.2 is the ceiling", () => {
    expect(promotionStatus({ band: "C1_2", consecutiveQualifying: 9, eriGatePasses: true, eriOffending: [], rss: 90 }).atCeiling).toBe(true);
  });

  it("audit pass needs target threshold and zero critical errors", () => {
    expect(promotionAuditPasses("B2_1", 72, 0)).toBe(true);
    expect(promotionAuditPasses("B2_1", 95, 1)).toBe(false);
    expect(promotionAuditPasses("B2_1", 71.9, 0)).toBe(false);
  });

  it("inactivity decay starts after 7 days and is never double-applied", () => {
    expect(inactivityDecay(50, daysAgo(6), NOW, 0)).toEqual({ level: 50, newlyDecayedDays: 0 });
    const first = inactivityDecay(50, daysAgo(10), NOW, 0);
    expect(first).toEqual({ level: 48.5, newlyDecayedDays: 3 });
    expect(inactivityDecay(first.level, daysAgo(10), NOW, 3)).toEqual({ level: 48.5, newlyDecayedDays: 0 });
  });

  it("demotes only below lower bound minus half a band", () => {
    expect(demotionCheck("B2_1", 44)).toBe("B2_1"); // 50 − 6.25 = 43.75
    expect(demotionCheck("B2_1", 43.7)).toBe("B1_2");
    expect(demotionCheck("A2_1", 0)).toBe("A2_1");
  });

  it("repair gate blocks on any critical or ≥ 2 moderate", () => {
    expect(repairGate([]).blocked).toBe(false);
    expect(repairGate([{ severity: "MINOR" }, { severity: "MINOR" }, { severity: "MODERATE" }]).blocked).toBe(false);
    expect(repairGate([{ severity: "MODERATE" }, { severity: "MODERATE" }]).blocked).toBe(true);
    expect(repairGate([{ severity: "CRITICAL" }]).blocked).toBe(true);
  });
});

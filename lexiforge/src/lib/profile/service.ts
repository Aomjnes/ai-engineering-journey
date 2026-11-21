/** Persists proficiency state. All math is delegated to src/lib/metrics; this file only loads and stores. */

import type { CefrSubBand, Prisma, ProficiencyProfile, SubmissionKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  bandLowerBound,
  compositeScore,
  computeEri,
  computeRss,
  demotionCheck,
  eriGate,
  ewma,
  ieltsEstimate,
  inactivityDecay,
  nextConsecutive,
  promotionStatus,
  sessionQualifies,
  updateLevel,
  type ProductionSession,
  type SubBand,
} from "@/lib/metrics/scoring";
import { retrievability } from "@/lib/metrics/srs";
import type { PlacementResult } from "@/lib/diagnostic/placement";

export class CalibrationRequiredError extends Error {
  readonly code = "CALIBRATION_REQUIRED";
  constructor() {
    super("Complete the placement audit first. Levels are never self-reported.");
  }
}

export async function getLocalUser() {
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.user.create({ data: { settings: { create: {} }, progress: { create: {} } } });
}

export async function getProfile(userId: string): Promise<ProficiencyProfile | null> {
  return prisma.proficiencyProfile.findUnique({ where: { userId } });
}

export async function requireProfile(userId: string): Promise<ProficiencyProfile> {
  const p = await getProfile(userId);
  if (!p) throw new CalibrationRequiredError();
  return p;
}

const PRODUCTION_KINDS: SubmissionKind[] = ["PRODUCTION", "DIAGNOSTIC_WRITING", "PROMOTION_AUDIT"];

/** First-attempt production sessions with their errors (ERI input). */
export async function loadProductionSessions(userId: string): Promise<ProductionSession[]> {
  const subs = await prisma.submissionAttempt.findMany({
    where: { userId, kind: { in: PRODUCTION_KINDS }, attemptNumber: 1, rejected: false },
    select: { createdAt: true, wordCount: true, errors: { select: { subtype: true, severity: true } } },
    orderBy: { createdAt: "asc" },
  });
  return subs.map((s) => ({ at: s.createdAt, words: s.wordCount, errors: s.errors }));
}

export async function computeRetention(userId: string, now: Date) {
  const [cards, reviews] = await Promise.all([
    prisma.srsCard.findMany({ where: { userId }, select: { stability: true, lastReviewAt: true, state: true } }),
    prisma.srsReview.findMany({ where: { card: { userId } }, select: { elapsedDays: true, recalled: true } }),
  ]);
  return computeRss(reviews, cards, now, retrievability);
}

export async function createProfileFromPlacement(userId: string, r: PlacementResult, now: Date): Promise<ProficiencyProfile> {
  const data = {
    subBand: r.subBand as CefrSubBand,
    ieltsEstimate: r.ielts.band,
    ieltsLow: r.ielts.low,
    ieltsHigh: r.ielts.high,
    gai: r.gai,
    lri: r.lri,
    cpr: r.readingAccuracy,
    rss: 0,
    eri: 100,
    composite: r.composite,
    abilityLevel: r.level,
    rssReviews: 0,
    eriSessions: 1,
    evidenceWords: r.evidenceWords,
    evidenceItems: r.evidenceItems,
    consecutiveQualifying: 0,
    decayedDays: 0,
    promotionAuditUnlocked: false,
    lastActivityAt: now,
    calibratedAt: now,
  };
  const profile = await prisma.proficiencyProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  await snapshot(profile, "DIAGNOSTIC", null, now);
  return profile;
}

async function snapshot(p: ProficiencyProfile, trigger: string, errorsPer100W: number | null, now: Date) {
  await prisma.proficiencySnapshot.create({
    data: {
      userId: p.userId,
      takenAt: now,
      subBand: p.subBand,
      ieltsEstimate: p.ieltsEstimate,
      gai: p.gai,
      lri: p.lri,
      cpr: p.cpr,
      rss: p.rss,
      eri: p.eri,
      composite: p.composite,
      abilityLevel: p.abilityLevel,
      errorsPer100W,
      trigger,
    },
  });
}

export interface SessionInput {
  taskDifficulty: number;
  gai: number | null;
  lri: number | null;
  cpr: number | null;
  passedGateFirstTry: boolean;
  words: number;
  items: number;
  errorsPer100W: number | null;
}

export interface SessionOutcome {
  sessionComposite: number;
  qualified: boolean;
  profile: ProficiencyProfile;
  promotion: ReturnType<typeof promotionStatus>;
  levelBefore: number;
  levelAfter: number;
}

/** Applies one verified session: EWMA metrics, difficulty-adjusted level, promotion lock, snapshot. */
export async function recordSession(userId: string, s: SessionInput, now: Date): Promise<SessionOutcome> {
  const p = await requireProfile(userId);
  const [retention, sessions] = await Promise.all([computeRetention(userId, now), loadProductionSessions(userId)]);
  const eri = computeEri(sessions, now);
  const gate = eriGate(sessions);
  const sessionComposite =
    compositeScore({ gai: s.gai, lri: s.lri, cpr: s.cpr, rss: retention.rss, eri: eri.eri }) ?? 0;
  const band = p.subBand as SubBand;
  const qualified = sessionQualifies(band, sessionComposite, s.taskDifficulty, s.passedGateFirstTry);
  const consecutive = nextConsecutive(p.consecutiveQualifying, qualified);
  const levelAfter = updateLevel(p.abilityLevel, s.taskDifficulty, sessionComposite);
  const gai = ewma(p.gai, s.gai) ?? p.gai;
  const lri = ewma(p.lri, s.lri) ?? p.lri;
  const cpr = ewma(p.cpr, s.cpr) ?? p.cpr;
  const rss = retention.rss ?? 0;
  const eriScore = eri.eri ?? p.eri;
  const composite = compositeScore({ gai, lri, cpr, rss: retention.rss, eri: eri.eri }) ?? p.composite;
  const demotedBand = demotionCheck(band, levelAfter);
  const evidenceWords = p.evidenceWords + s.words;
  const evidenceItems = p.evidenceItems + s.items;
  const ielts = ieltsEstimate(levelAfter, evidenceWords, evidenceItems);
  const promotion = promotionStatus({
    band: demotedBand,
    consecutiveQualifying: demotedBand === band ? consecutive : 0,
    eriGatePasses: gate.passes,
    eriOffending: gate.offending,
    rss: retention.matureReviews > 0 ? retention.rss : null,
  });
  const updated = await prisma.proficiencyProfile.update({
    where: { userId },
    data: {
      gai,
      lri,
      cpr,
      rss,
      eri: eriScore,
      composite,
      abilityLevel: levelAfter,
      subBand: demotedBand as CefrSubBand,
      ieltsEstimate: ielts.band,
      ieltsLow: ielts.low,
      ieltsHigh: ielts.high,
      rssReviews: retention.matureReviews,
      eriSessions: sessions.length,
      evidenceWords,
      evidenceItems,
      consecutiveQualifying: demotedBand === band ? consecutive : 0,
      promotionAuditUnlocked: promotion.unlocked,
      lastActivityAt: now,
      decayedDays: 0,
    },
  });
  await snapshot(updated, demotedBand === band ? "SESSION" : "DEMOTION", s.errorsPer100W, now);
  return { sessionComposite, qualified, profile: updated, promotion, levelBefore: p.abilityLevel, levelAfter };
}

/** Lazily applies honest decay (inactivity + retention) on dashboard load. Idempotent per day. */
export async function applyDecay(userId: string, now: Date): Promise<ProficiencyProfile | null> {
  const p = await getProfile(userId);
  if (!p) return null;
  const retention = await computeRetention(userId, now);
  const decay = inactivityDecay(p.abilityLevel, p.lastActivityAt, now, p.decayedDays);
  const rssChanged = retention.rss !== null && Math.abs(retention.rss - p.rss) >= 0.5;
  if (decay.newlyDecayedDays === 0 && !rssChanged) return p;
  const band = demotionCheck(p.subBand as SubBand, decay.level);
  const rss = retention.rss ?? p.rss;
  const composite =
    compositeScore({ gai: p.gai, lri: p.lri, cpr: p.cpr, rss: retention.rss, eri: p.eriSessions >= 2 ? p.eri : null }) ?? p.composite;
  const ielts = ieltsEstimate(decay.level, p.evidenceWords, p.evidenceItems);
  const data: Prisma.ProficiencyProfileUpdateInput = {
    abilityLevel: decay.level,
    decayedDays: p.decayedDays + decay.newlyDecayedDays,
    rss,
    rssReviews: retention.matureReviews,
    composite,
    subBand: band as CefrSubBand,
    ieltsEstimate: ielts.band,
    ieltsLow: ielts.low,
    ieltsHigh: ielts.high,
    ...(band !== p.subBand || decay.newlyDecayedDays > 0 ? { consecutiveQualifying: 0, promotionAuditUnlocked: false } : {}),
  };
  const updated = await prisma.proficiencyProfile.update({ where: { userId }, data });
  if (decay.newlyDecayedDays > 0 || band !== p.subBand) await snapshot(updated, band !== p.subBand ? "DEMOTION" : "DECAY", null, now);
  return updated;
}

/** Applies a Band Promotion Audit outcome. */
export async function applyPromotionAudit(userId: string, passed: boolean, targetBand: SubBand, now: Date): Promise<ProficiencyProfile> {
  const p = await requireProfile(userId);
  const data: Prisma.ProficiencyProfileUpdateInput = passed
    ? {
        subBand: targetBand as CefrSubBand,
        // Lift the continuous level to at least the new band's floor so the two scales stay consistent.
        abilityLevel: Math.max(p.abilityLevel, bandLowerBound(targetBand)),
        consecutiveQualifying: 0,
        promotionAuditUnlocked: false,
        lastActivityAt: now,
      }
    : { consecutiveQualifying: 0, promotionAuditUnlocked: false, lastActivityAt: now };
  const updated = await prisma.proficiencyProfile.update({ where: { userId }, data });
  if (updated.abilityLevel !== p.abilityLevel) {
    const ielts = ieltsEstimate(updated.abilityLevel, updated.evidenceWords, updated.evidenceItems);
    await prisma.proficiencyProfile.update({ where: { userId }, data: { ieltsEstimate: ielts.band, ieltsLow: ielts.low, ieltsHigh: ielts.high } });
  }
  await snapshot(updated, passed ? "PROMOTION" : "PROMOTION_FAILED", null, now);
  return updated;
}

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { applyDecay, applyPromotionAudit, recordSession } from "@/lib/profile/service";
import { resetDb, testStream } from "../helpers/db";

const T0 = new Date("2026-08-01T09:00:00Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

async function setup(level = 64) {
  const user = await testStream();
  await prisma.proficiencyProfile.create({
    data: { streamId: user.id, subBand: "B1_2", ieltsEstimate: 5, ieltsLow: 4.5, ieltsHigh: 5.5, gai: 80, lri: 75, cpr: 80, rss: 0, eri: 100, composite: 78, abilityLevel: level, lastActivityAt: T0 },
  });
  return user;
}

/** Stores a first-attempt production submission (ERI input) with optional critical subtype. */
async function production(streamId: string, at: Date, criticalSubtype?: string) {
  const sub = await prisma.submissionAttempt.create({ data: { streamId, kind: "PRODUCTION", text: "text", wordCount: 120, taskDifficulty: 66, createdAt: at } });
  if (criticalSubtype) {
    await prisma.errorLog.create({ data: { streamId, submissionId: sub.id, category: "GRAMMAR", subtype: criticalSubtype, severity: "CRITICAL", spanStart: 0, spanEnd: 1, original: "t", correction: "T", ruleEn: "r", ruleVi: "q", createdAt: at } });
  }
}

const strong = { taskDifficulty: 66, gai: 92, lri: 85, cpr: 90, passedGateFirstTry: true, words: 120, items: 3, errorsPer100W: 0.8 };

describe("strict promotion lock", () => {
  beforeEach(resetDb);

  it("unlocks the Band Promotion Audit only after 5 consecutive qualifying sessions", async () => {
    const user = await setup();
    for (let i = 0; i < 4; i++) {
      await production(user.id, day(i));
      const out = await recordSession(user.id, strong, day(i));
      expect(out.qualified).toBe(true);
      expect(out.promotion.unlocked).toBe(false);
    }
    await production(user.id, day(4));
    const fifth = await recordSession(user.id, strong, day(4));
    expect(fifth.profile.consecutiveQualifying).toBe(5);
    expect(fifth.promotion.unlocked).toBe(true);
    expect(fifth.profile.promotionAuditUnlocked).toBe(true);
  });

  it("a single bad session resets the streak (no lucky spikes)", async () => {
    const user = await setup();
    for (let i = 0; i < 4; i++) {
      await production(user.id, day(i));
      await recordSession(user.id, strong, day(i));
    }
    await production(user.id, day(4));
    const bad = await recordSession(user.id, { ...strong, passedGateFirstTry: false }, day(4));
    expect(bad.profile.consecutiveQualifying).toBe(0);
    expect(bad.promotion.unlocked).toBe(false);
  });

  it("recurring critical errors block promotion even with 5 qualifying sessions", async () => {
    const user = await setup();
    for (let i = 0; i < 5; i++) {
      await production(user.id, day(i), i < 3 ? "ARTICLE_OMISSION" : undefined);
      await recordSession(user.id, strong, day(i));
    }
    const p = await prisma.proficiencyProfile.findUniqueOrThrow({ where: { streamId: user.id } });
    expect(p.consecutiveQualifying).toBe(5);
    expect(p.promotionAuditUnlocked).toBe(false);
  });

  it("too-easy material never qualifies and failing easy work drops the level sharply", async () => {
    const user = await setup(66);
    await production(user.id, day(0));
    const easy = await recordSession(user.id, { ...strong, taskDifficulty: 45 }, day(0));
    expect(easy.qualified).toBe(false);
    await production(user.id, day(1));
    const fail = await recordSession(user.id, { ...strong, taskDifficulty: 35, gai: 20, lri: 20, cpr: 20 }, day(1));
    expect(fail.levelAfter).toBeLessThan(fail.levelBefore - 10);
  });

  it("passing the audit promotes; inactivity decays honestly and can demote", async () => {
    const user = await setup(66);
    const promoted = await applyPromotionAudit(user.id, true, "B2_1", T0);
    expect(promoted.subBand).toBe("B2_1");
    expect(promoted.abilityLevel).toBe(69);
    // 40 days idle → 33 decay days → level 69 − 16.5 = 52.5 < 69 − width(B1.2)/2 = 65 → demoted to B1.2
    const decayed = await applyDecay(user.id, day(40));
    expect(decayed?.abilityLevel).toBe(52.5);
    expect(decayed?.subBand).toBe("B1_2");
    // Idempotent on the same day.
    expect((await applyDecay(user.id, day(40)))?.abilityLevel).toBe(52.5);
    expect(await prisma.proficiencySnapshot.count({ where: { streamId: user.id, trigger: "DEMOTION" } })).toBe(1);
  });
});

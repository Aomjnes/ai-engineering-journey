import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setLlmClientForTesting } from "@/lib/llm/client";
import { answerPlacement, setupAndStartPlacement, startPromotionAudit, submitPlacementWriting } from "@/lib/diagnostic/service";
import { oracleAnswer } from "./oracle";
import { getProfile } from "@/lib/profile/service";
import { testStream } from "../helpers/db";
import { AppError } from "@/lib/http";
import { resetDb } from "../helpers/db";
import { errorFor, learnerText, ScriptedLlm } from "../helpers/scripted-llm";

const SAMPLE =
  "I think my city should ban cars from the centre, but only step by step. The streets near the market is always full of motorbikes and the air is very dirty in the morning. If the centre becomes car-free, people can walk and sit in small cafes without noise. For example, in Hoi An the old town is closed to cars in the evening and it is much more pleasant. However, the city must give more buses first, because many workers live far away and they cannot walk to their offices.";

const evaluatorReply = (req: { user: string }) => {
  const t = learnerText(req as never);
  return JSON.stringify({
    errors: [
      errorFor(t, "is always", { category: "GRAMMAR", subtype: "SV_AGREEMENT", severity: "MODERATE", correction: "are always" }),
      errorFor(t, "give more buses", { category: "COLLOCATION_NATURALNESS", subtype: "UNNATURAL_COLLOCATION", severity: "MINOR", correction: "provide more buses" }),
    ],
    chunkUsage: [],
    offPrompt: false,
    nativeUpgrade: "I think my city should phase in a car ban in the centre.",
    verdictEn: "Subject–verb agreement fails with the plural subject 'streets'.",
    verdictVi: "Chủ ngữ số nhiều 'streets' cần động từ 'are'.",
  });
};

describe("placement audit (DB + scripted evaluator)", () => {
  beforeEach(async () => {
    await resetDb();
    setLlmClientForTesting(new ScriptedLlm([evaluatorReply]));
  });
  afterAll(() => setLlmClientForTesting(null));

  it("runs setup → staircase → writing, creates profile, goal, roadmap and a Vietnamese-ready report", async () => {
    const user = await testStream();
    const now = new Date("2026-05-01T08:00:00Z");
    await expect(setupAndStartPlacement(user.id, { comfortTier: 2, targetSubBand: "Z9", dailyMinutes: 30 }, now)).rejects.toMatchObject({ code: "INVALID_TARGET" });
    let step = await setupAndStartPlacement(user.id, { comfortTier: 2, targetSubBand: "B2_2", dailyMinutes: 45 }, now);
    expect(step.tier).toBe(2);
    // Pass Tier 2 (correct answers), fail Tier 3 (skip) → writing at Tier 2.
    for (let guard = 0; guard < 40 && step.phase === "OBJECTIVE" && step.item; guard++) {
      const answer = step.tier === 2 ? oracleAnswer(step.item.id, 2, true) : ({ kind: "skip" } as const);
      step = await answerPlacement(user.id, step.assessmentId, step.item.id, answer, now);
    }
    expect(step.phase).toBe("WRITING");
    expect(step.item?.part).toBe("WRITING");

    await expect(submitPlacementWriting(user.id, step.assessmentId, "Too short to grade.", now)).rejects.toBeInstanceOf(AppError);
    const done = await submitPlacementWriting(user.id, step.assessmentId, SAMPLE, now);
    const report = done.report;
    expect(report.subBand).toMatch(/^(A2_2|B1_1|B1_2|B2_1|B2_2)$/);
    expect(report.stoppedEarly).toBe(false);
    expect(report.blockers).toContain("SV_AGREEMENT");
    expect(report.blockers.length).toBeLessThanOrEqual(3);
    expect(report.writingFeedback?.verdictVi).toContain("are");
    const profile = await getProfile(user.id);
    expect(profile?.gai).toBe(report.metrics.gai);
    expect(await prisma.proficiencySnapshot.count({ where: { streamId: user.id, trigger: "DIAGNOSTIC" } })).toBe(1);
    expect(await prisma.errorLog.count({ where: { streamId: user.id } })).toBe(2);
    const goal = await prisma.learningGoal.findUniqueOrThrow({ where: { streamId: user.id } });
    expect(goal.targetSubBand).toBe("B2_2");
    expect(goal.dailyMinutes).toBe(45);
    expect(goal.startSubBand).toBe(report.subBand);
    expect(await prisma.roadmapMilestone.count({ where: { streamId: user.id } })).toBeGreaterThan(0);
    await expect(submitPlacementWriting(user.id, step.assessmentId, SAMPLE, now)).rejects.toMatchObject({ code: "ALREADY_COMPLETED" });
  });

  it("a Pre-A1 learner who skips Tier 0 finishes without any writing or LLM call", async () => {
    setLlmClientForTesting(new ScriptedLlm([() => { throw new Error("no LLM call expected"); }]));
    const user = await testStream();
    const now = new Date("2026-05-01T08:00:00Z");
    let step = await setupAndStartPlacement(user.id, { comfortTier: 0, targetSubBand: "A2_2", dailyMinutes: 15 }, now);
    let report: { stoppedEarly: boolean; subBand: string; writingFeedback: unknown } | undefined;
    for (let guard = 0; guard < 20 && step.phase === "OBJECTIVE" && step.item; guard++) {
      const r = await answerPlacement(user.id, step.assessmentId, step.item.id, { kind: "skip" }, now);
      step = r;
      if ("report" in r) report = r.report;
    }
    expect(step.phase).toBe("DONE");
    expect(report?.stoppedEarly).toBe(true);
    expect(["PRE_A1", "A1_1"]).toContain(report?.subBand);
    expect(report?.writingFeedback).toBeNull();
    const milestones = await prisma.roadmapMilestone.findMany({ where: { streamId: user.id }, orderBy: { orderIndex: "asc" } });
    expect(milestones[0]?.fromBand).toBe(report?.subBand);
    expect(milestones[milestones.length - 1]?.toBand).toBe("A2_2");
  });

  it("locks the Band Promotion Audit until conditions are met", async () => {
    const user = await testStream();
    await expect(startPromotionAudit(user.id, new Date())).rejects.toMatchObject({ code: "CALIBRATION_REQUIRED" });
    await prisma.proficiencyProfile.create({
      data: { streamId: user.id, subBand: "B1_1", ieltsEstimate: 5, ieltsLow: 4.5, ieltsHigh: 5.5, gai: 70, lri: 60, cpr: 70, rss: 0, eri: 100, composite: 66, abilityLevel: 55 },
    });
    await expect(startPromotionAudit(user.id, new Date())).rejects.toMatchObject({ code: "PROMOTION_LOCKED" });
  });
});

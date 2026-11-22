import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setLlmClientForTesting } from "@/lib/llm/client";
import { answerPlacement, startPlacement, startPromotionAudit, submitPlacementWriting } from "@/lib/diagnostic/service";
import { ERROR_ITEMS, READING_PASSAGES } from "@/lib/diagnostic/item-bank";
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

  it("runs the full 3-part audit and creates a profile + baseline snapshot", async () => {
    const user = await testStream();
    const now = new Date("2026-05-01T08:00:00Z");
    let step = await startPlacement(user.id, now);
    // Resuming returns the same in-progress assessment.
    expect((await startPlacement(user.id, now)).assessmentId).toBe(step.assessmentId);
    while (step.part === "READING" && step.item && step.item.part === "READING") {
      const passage = READING_PASSAGES.find((p) => p.id === step.item?.id);
      step = await answerPlacement(user.id, step.assessmentId, { itemId: step.item.id, choices: passage?.questions.map((q) => (q.difficulty < 50 ? q.answer : 0)) ?? [] });
    }
    while (step.part === "ERRORS" && step.item && step.item.part === "ERRORS") {
      const it = ERROR_ITEMS.find((i) => i.id === step.item?.id);
      step = await answerPlacement(user.id, step.assessmentId, { itemId: step.item.id, choice: it && it.difficulty < 50 ? it.answer : 4 });
    }
    expect(step.part).toBe("WRITING");

    await expect(submitPlacementWriting(user.id, step.assessmentId, "Too short to grade.", now)).rejects.toBeInstanceOf(AppError);

    const { report } = await submitPlacementWriting(user.id, step.assessmentId, SAMPLE, now);
    expect(report.subBand).toMatch(/^(A2|B1|B2|C1)\.[12]$/);
    expect(report.ielts.band).toBeGreaterThanOrEqual(4);
    expect(report.ielts.low).toBeLessThan(report.ielts.high);
    expect(report.topWeaknesses).toContain("SV_AGREEMENT");
    const profile = await getProfile(user.id);
    expect(profile).not.toBeNull();
    expect(profile?.gai).toBe(report.parts.writing.gai.gai);
    expect(await prisma.proficiencySnapshot.count({ where: { streamId: user.id, trigger: "DIAGNOSTIC" } })).toBe(1);
    expect(await prisma.errorLog.count({ where: { streamId: user.id } })).toBe(2);
    // Finished assessments cannot be resubmitted.
    await expect(submitPlacementWriting(user.id, step.assessmentId, SAMPLE, now)).rejects.toMatchObject({ code: "ALREADY_COMPLETED" });
  });

  it("locks the Band Promotion Audit until conditions are met", async () => {
    const user = await testStream();
    await expect(startPromotionAudit(user.id, new Date())).rejects.toMatchObject({ code: "CALIBRATION_REQUIRED" });
    await prisma.proficiencyProfile.create({
      data: { streamId: user.id, subBand: "B1_1", ieltsEstimate: 5, ieltsLow: 4.5, ieltsHigh: 5.5, gai: 70, lri: 60, cpr: 70, rss: 0, eri: 100, composite: 66, abilityLevel: 30 },
    });
    await expect(startPromotionAudit(user.id, new Date())).rejects.toMatchObject({ code: "PROMOTION_LOCKED" });
  });
});

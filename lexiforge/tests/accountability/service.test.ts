import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setLlmClientForTesting } from "@/lib/llm/client";
import { accountabilityStatus, assertLessonsUnlocked, completeDetox, errorGraveyard, startDetox, submitDetoxRewrite } from "@/lib/accountability/service";
import { resetDb, testStream } from "../helpers/db";
import { errorFor, learnerText, ScriptedLlm } from "../helpers/scripted-llm";

const T0 = new Date("2026-06-01T10:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

async function seedErrors(streamId: string) {
  for (let i = 0; i < 4; i++) {
    const sub = await prisma.submissionAttempt.create({ data: { streamId, kind: "PRODUCTION", text: "He go to market yesterday and buy fish.", wordCount: 8, taskDifficulty: 40, createdAt: new Date(T0.getTime() - (i + 1) * 86_400_000) } });
    await prisma.errorLog.create({ data: { streamId, submissionId: sub.id, category: "GRAMMAR", subtype: "TENSE_SHIFT", severity: "CRITICAL", spanStart: 3, spanEnd: 5, original: "go", correction: "went", ruleEn: "Past time needs past tense.", ruleVi: "Thời quá khứ cần động từ quá khứ.", createdAt: sub.createdAt } });
  }
}

let mode: "repeat" | "clean" = "repeat";
const reply = (req: { user: string }) => {
  const t = learnerText(req as never);
  const errors = mode === "repeat" && t.includes(" go ") ? [errorFor(t, "go", { category: "GRAMMAR", subtype: "TENSE_SHIFT", severity: "CRITICAL", correction: "went" })] : [];
  return JSON.stringify({ errors, chunkUsage: [], offPrompt: false, nativeUpgrade: t, verdictEn: errors.length ? "Tense shift persists." : "No tense errors detected.", verdictVi: "Nhận xét." });
};

describe("Error Detox accountability gate", () => {
  beforeEach(async () => {
    await resetDb();
    mode = "repeat";
    setLlmClientForTesting(new ScriptedLlm([reply]));
  });
  afterAll(() => setLlmClientForTesting(null));

  it("locks lessons on recurring error debt and only unlocks after a timed, clean detox", async () => {
    const user = await testStream();
    await seedErrors(user.id);
    const status = await accountabilityStatus(user.id, T0);
    expect(status.errorDebt).toBe(12);
    expect(status.locked).toBe(true);
    await expect(assertLessonsUnlocked(user.id, T0)).rejects.toMatchObject({ code: "LOCKED_ERROR_DETOX", status: 423 });

    const started = await startDetox(user.id, T0);
    expect(started.detox?.targets).toEqual([{ subtype: "TENSE_SHIFT", cleared: false }]);
    await expect(completeDetox(user.id, at(120))).rejects.toMatchObject({ code: "DETOX_TOO_SHORT" });

    const bad = await submitDetoxRewrite(user.id, "TENSE_SHIFT", "Yesterday he go to the market and bought some fish for dinner.", at(150));
    expect(bad.clean).toBe(false);
    await expect(completeDetox(user.id, at(310))).rejects.toMatchObject({ code: "DETOX_TARGETS_OPEN" });

    mode = "clean";
    const good = await submitDetoxRewrite(user.id, "TENSE_SHIFT", "Yesterday he went to the market and bought some fish for dinner.", at(200));
    expect(good.clean).toBe(true);
    const done = await completeDetox(user.id, at(301));
    expect(done.locked).toBe(false);
    await expect(assertLessonsUnlocked(user.id, at(302))).resolves.toBeUndefined();
    const graveyard = await errorGraveyard(user.id);
    expect(graveyard[0]?.subtype).toBe("TENSE_SHIFT");
    expect(graveyard[0]?.unresolved).toBe(1); // only the failed detox attempt's new error remains
  });

  it("locks on overdue SRS cards", async () => {
    const user = await testStream();
    await prisma.srsCard.createMany({
      data: Array.from({ length: 15 }, (_, i) => ({ streamId: user.id, front: `chunk ${i}`, back: "{}", state: "REVIEW", stability: 3, lastReviewAt: new Date(T0.getTime() - 5 * 86_400_000), dueAt: new Date(T0.getTime() - 86_400_000) })),
    });
    await prisma.userProgress.upsert({ where: { streamId: user.id }, update: { lastReviewAt: new Date(T0.getTime() - 86_400_000) }, create: { streamId: user.id } });
    const s = await accountabilityStatus(user.id, T0);
    expect(s.overdueCards).toBe(15);
    expect(s.locked).toBe(true);
  });
});

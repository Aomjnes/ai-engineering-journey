import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setLlmClientForTesting, type CompletionRequest } from "@/lib/llm/client";
import { lessonView, shadowSentenceFor, submitComprehension, submitExitTicket, submitProduction, submitRewrite, submitShadowing } from "@/lib/lessons/flow";
import { dueCards, gapSentence, reviewCard } from "@/lib/srs/service";
import { getLocalUser } from "@/lib/profile/service";
import { resetDb } from "../helpers/db";
import { errorFor, learnerText, ScriptedLlm } from "../helpers/scripted-llm";
import { ARTICLE_PARAGRAPHS } from "../fixtures/article";

const READING = ARTICLE_PARAGRAPHS.join("\n\n");
const CHUNKS = ["raised concerns about", "won the support of", "remain stable"];
const NOW = new Date("2026-07-01T09:00:00Z");

const PRODUCTION_BAD =
  "Dear council, I read that the plan won the support of a small majority. Many parents raised concerns about safety, and I am agree with them. The buildings is on the water and storms are common there. Even if engineers say the classrooms will remain stable, I think the city should test them for one winter before children move in. Please publish the safety report.";
const PRODUCTION_FIXED =
  "Dear council, I read that the plan won the support of a small majority. Many parents raised concerns about safety, and I agree with them. The buildings are on the water, and storms are common there. Even if engineers say the classrooms will remain stable, I think the city should test them for one winter before children move in. Please publish the safety report.";
const UPGRADE =
  "Dear Council, I understand that the proposal narrowly won the support of the chamber. Like many parents, I have raised concerns about safety, and I share their unease. The warehouses stand on exposed water where storm surges are frequent. Engineers may insist the structures will remain stable, yet a full winter of monitoring should precede any enrolment. I urge you to publish the engineering assessment in full.";

function reply(req: CompletionRequest): string {
  if (req.user.includes("reading-comprehension answer")) {
    const answer = learnerText(req);
    const met = answer.includes("storm");
    const n = (req.user.match(/^\d+\. /gm) ?? []).length;
    return JSON.stringify({ rubric: Array.from({ length: n }, (_, i) => ({ criterion: `c${i}`, met, evidence: "e" })), misreadSource: false, errors: [], verdictEn: met ? "Rubric satisfied." : "Misses the storm risk.", verdictVi: "Nhận xét." });
  }
  const t = learnerText(req);
  if (req.user.includes("exit-ticket")) {
    const lines = t.split("\n");
    return JSON.stringify({
      errors: lines[1]?.includes("are agree") ? [errorFor(t, "are agree", { category: "GRAMMAR", subtype: "VERB_PATTERN", severity: "MODERATE", correction: "agree" })] : [],
      chunkUsage: CHUNKS.map((chunk) => ({ chunk, used: true, usedCorrectly: true, note: "ok" })),
      offPrompt: false, nativeUpgrade: t, verdictEn: "Checked each line.", verdictVi: "Đã kiểm tra.",
    });
  }
  const errors = [];
  if (t.includes("am agree")) errors.push(errorFor(t, "am agree", { category: "GRAMMAR", subtype: "VERB_PATTERN", severity: "CRITICAL", correction: "agree" }));
  if (t.includes("buildings is")) errors.push(errorFor(t, "buildings is", { category: "GRAMMAR", subtype: "SV_AGREEMENT", severity: "MODERATE", correction: "buildings are" }));
  return JSON.stringify({
    errors,
    chunkUsage: CHUNKS.map((chunk) => ({ chunk, used: true, usedCorrectly: true, note: "Natural use." })),
    offPrompt: false, nativeUpgrade: UPGRADE, verdictEn: errors.length ? "'agree' is a verb; 'am agree' is a Vietnamese calque." : "No errors found.", verdictVi: "'agree' là động từ.",
  });
}

async function seedLesson() {
  const user = await getLocalUser();
  const feed = await prisma.sourceFeed.create({ data: { name: "T", url: "https://e.com/rss", homepage: "https://e.com", topic: "t" } });
  const article = await prisma.dailyArticle.create({
    data: { feedId: feed.id, urlHash: "x", url: "https://e.com/a", title: "Floating classrooms", content: READING, wordCount: 330, sentenceCount: 14, fleschKincaidGrade: 12, fleschReadingEase: 45, avgSentenceLength: 23, avgSyllablesPerWord: 1.6, lexicalSophistication: 0.2, cefrTier: "B2", difficultyScore: 52 },
  });
  await prisma.proficiencyProfile.create({ data: { userId: user.id, subBand: "B2_1", ieltsEstimate: 6, ieltsLow: 5.5, ieltsHigh: 6.5, gai: 70, lri: 60, cpr: 70, rss: 0, eri: 100, composite: 66, abilityLevel: 52 } });
  const lesson = await prisma.lessonUnit.create({
    data: {
      userId: user.id, articleId: article.id, targetSubBand: "B2_1", difficultyScore: 52, isGraded: false, readingText: READING, authenticExcerpt: READING, comprehensibility: 0.88,
      grammarInWild: [], productionPrompt: "Write a 100-word email to the council about the floating classrooms using 3 chunks.",
      questions: [
        { id: "q1", type: "inference", prompt: "Why might insurers hesitate?", rubric: ["Mentions storms", "Links to insurance"] },
        { id: "q2", type: "paraphrase", prompt: "What risk do opposition councillors see?", rubric: ["Mentions storms", "Mentions safety"] },
      ],
      chunks: { create: CHUNKS.map((phrase) => ({ phrase, sourceSentence: READING.split(/(?<=\.)\s+/).find((s) => s.includes(phrase.split(" ")[0] as string)) ?? "", meaningEn: "m", meaningVi: "nghĩa", cefrTier: "B2", isStretch: false })) },
    },
    include: { chunks: true },
  });
  return { user, lesson };
}

describe("4-stage acquisition loop (grading pipeline)", () => {
  beforeEach(async () => {
    await resetDb();
    setLlmClientForTesting(new ScriptedLlm([reply]));
  });
  afterAll(() => setLlmClientForTesting(null));

  it("enforces stage order, copy-paste rejection, the repair gate, and SRS lock-in", async () => {
    const { user, lesson } = await seedLesson();
    // Cannot skip ahead.
    await expect(submitProduction(user.id, lesson.id, PRODUCTION_BAD, NOW)).rejects.toMatchObject({ code: "STAGE_ORDER" });

    // Stage 1: shadowing must be accurate.
    const target = shadowSentenceFor(lesson)?.text ?? "";
    expect((await submitShadowing(user.id, lesson.id, "something else entirely")).passed).toBe(false);
    expect((await submitShadowing(user.id, lesson.id, target.toLowerCase())).passed).toBe(true);

    // Stage 2: copy-paste rejected deterministically (scores 0 as first attempt), then a real answer passes.
    const copied = await submitComprehension(user.id, lesson.id, "q1", ARTICLE_PARAGRAPHS[2] as string);
    expect(copied.copyRejected).toBe(true);
    const q1 = await submitComprehension(user.id, lesson.id, "q1", "Because the site is often hit by storm surges, so insurance could be very expensive.");
    expect(q1.passed).toBe(true);
    expect(q1.nextStage).toBe("COMPREHENSION");
    const q2 = await submitComprehension(user.id, lesson.id, "q2", "They worry that storm damage makes the buildings unsafe for children.");
    expect(q2.nextStage).toBe("PRODUCTION");

    // Stage 3: critical + moderate errors block progression; the session is scored on this first attempt.
    const prod = await submitProduction(user.id, lesson.id, PRODUCTION_BAD, NOW);
    expect(prod.blocked).toBe(true);
    expect(prod.reasons[0]).toMatch(/critical/);
    expect(prod.diff.filter((d) => d.type === "error")).toHaveLength(2);
    expect(prod.session.qualified).toBe(false);
    const snap = await prisma.proficiencySnapshot.findFirst({ where: { userId: user.id, trigger: "SESSION" } });
    expect(snap).not.toBeNull();
    // CPR uses first attempts only: q1 first attempt was copy-paste (0), q2 passed (1) → 50.
    const sub = await prisma.submissionAttempt.findFirstOrThrow({ where: { lessonId: lesson.id, kind: "PRODUCTION" } });
    expect(sub.passedGate).toBe(false);
    await expect(submitProduction(user.id, lesson.id, PRODUCTION_FIXED, NOW)).rejects.toMatchObject({ code: "REWRITE_REQUIRED" });

    // Pasting the native upgrade is refused; a genuine rewrite passes the gate.
    await expect(submitRewrite(user.id, lesson.id, UPGRADE)).rejects.toMatchObject({ code: "UPGRADE_COPIED" });
    const rw = await submitRewrite(user.id, lesson.id, PRODUCTION_FIXED);
    expect(rw.blocked).toBe(false);
    expect(rw.nextStage).toBe("EXIT_TICKET");

    // Stage 4: one original sentence per chunk; failures must be redone, passes become SRS cards.
    const ids = lesson.chunks.map((c) => c.id);
    const first = await submitExitTicket(user.id, lesson.id, [
      { chunkId: ids[0] as string, text: "Neighbours raised concerns about the noise from the new bar." },
      { chunkId: ids[1] as string, text: "The idea won the support of most teachers, but we are agree it needs money." },
      { chunkId: ids[2] as string, text: "Our team must remain stable when the manager leaves next month." },
    ], NOW);
    expect(first.results.filter((r) => r.passed)).toHaveLength(2);
    expect(first.nextStage).toBe("EXIT_TICKET");
    const second = await submitExitTicket(user.id, lesson.id, [{ chunkId: ids[1] as string, text: "The new library won the support of almost every parent in our street." }], NOW);
    expect(second.nextStage).toBe("COMPLETED");
    expect(await prisma.srsCard.count({ where: { userId: user.id } })).toBe(3);
    const view = await lessonView(user.id, lesson.id);
    expect(view.stage).toBe("COMPLETED");
    expect(JSON.stringify(view)).not.toContain("rubric");

    // SRS: cards are due; typed recall is graded deterministically and scheduled by FSRS.
    const due = await dueCards(user.id, NOW);
    expect(due).toHaveLength(3);
    expect(due.every((d) => d.gapped.includes("_____"))).toBe(true);
    const card = due.find((d) => d.gapped.includes("the noise"));
    const r = await reviewCard(user.id, card?.id ?? "", "raised concerns about", 3000, NOW);
    expect(r.ratingLabel).toBe("Easy");
    expect(r.nextDueAt.getTime()).toBeGreaterThan(NOW.getTime());
    await expect(reviewCard(user.id, card?.id ?? "", "x", 1000, NOW)).rejects.toMatchObject({ code: "NOT_DUE" });
  });

  it("gapSentence hides inflected chunks", () => {
    expect(gapSentence("Residents have raised serious concerns about it.", "raise concerns about")).toBe("Residents have _____ it.");
  });
});

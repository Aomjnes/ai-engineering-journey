import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setLlmClientForTesting } from "@/lib/llm/client";
import { onboardingAccess, isRetake } from "@/lib/diagnostic/access";
import { POST as resetPOST } from "@/app/api/stream/reset/route";
import { POST as initPOST } from "@/app/api/roadmap/initialize/route";
import { GET as roadmapGET } from "@/app/api/roadmap/route";
import { GET as diagnosticGET, POST as diagnosticPOST } from "@/app/api/diagnostic/route";
import { GET as meGET } from "@/app/api/stream/me/route";
import { handle } from "@/lib/http";
import { AllProvidersExhaustedError } from "@/lib/llm/router";
import { resetDb, testStream } from "../helpers/db";
import { cookieFor, req } from "../helpers/session";
import { ScriptedLlm } from "../helpers/scripted-llm";

const noLlm = () => {
  throw new Error("This flow must not call the LLM.");
};

/** A stream with data in every isolated table. */
async function seedEverything(streamId: string, tag: string) {
  const feed = await prisma.sourceFeed.upsert({ where: { url: "https://e.com/rss" }, update: {}, create: { name: "E", url: "https://e.com/rss", homepage: "https://e.com", topic: "t" } });
  const article = await prisma.dailyArticle.upsert({
    where: { urlHash: "shared" },
    update: {},
    create: { feedId: feed.id, urlHash: "shared", url: "https://e.com/a", title: "Shared", content: "Shared text.", wordCount: 300, sentenceCount: 10, fleschKincaidGrade: 10, fleschReadingEase: 50, avgSentenceLength: 20, avgSyllablesPerWord: 1.5, lexicalSophistication: 0.2, cefrTier: "B2", difficultyScore: 60 },
  });
  await prisma.explanationCache.upsert({ where: { key: "shared-expl" }, update: {}, create: { key: "shared-expl", selection: "x", level: "B1.1", provider: "test", model: "m", payload: {} } });
  await prisma.practicePromptCache.upsert({ where: { key: "shared-practice" }, update: {}, create: { key: "shared-practice", mode: "SENTENCE", level: "B1_1", topicHash: "h", payload: {}, provider: "test", model: "m" } });
  await prisma.proficiencyProfile.create({ data: { streamId, subBand: "B1_1", ieltsEstimate: 5, ieltsLow: 4.5, ieltsHigh: 5.5, gai: 70, lri: 60, cpr: 70, rss: 0, eri: 100, composite: 66, abilityLevel: 56 } });
  await prisma.proficiencySnapshot.create({ data: { streamId, trigger: "DIAGNOSTIC", subBand: "B1_1", abilityLevel: 56, gai: 70, lri: 60, cpr: 70, rss: 0, eri: 100, composite: 66, ieltsEstimate: 5 } });
  await prisma.diagnosticAssessment.create({ data: { streamId, kind: "PLACEMENT", status: "COMPLETED", itemsJson: {} } });
  await prisma.learningGoal.create({ data: { streamId, startSubBand: "B1_1", targetSubBand: "B2_2", targetLabel: "B2.2", dailyMinutes: 30 } });
  await prisma.roadmapMilestone.create({ data: { streamId, orderIndex: 0, fromBand: "B1_1", toBand: "B1_2", titleVi: "t", titleEn: "t", outcomeVi: "o", outcomeEn: "o", coreTopicsJson: {}, status: "ACTIVE", requiredGai: 60, requiredLri: 50, requiredRss: 60, requiredSessions: 5, estimatedHours: 50 } });
  const lesson = await prisma.lessonUnit.create({ data: { streamId, articleId: article.id, targetSubBand: "B1_1", difficultyScore: 60, isGraded: false, readingText: `Reading ${tag}.`, authenticExcerpt: "x", comprehensibility: 0.9, grammarInWild: [], questions: [], productionPrompt: "p" } });
  const chunk = await prisma.lexicalChunk.create({ data: { streamId, lessonId: lesson.id, phrase: `chunk ${tag}`, sourceSentence: "s", meaningEn: "m", meaningVi: "n", cefrTier: "B1", isStretch: false } });
  const card = await prisma.srsCard.create({ data: { streamId, chunkId: chunk.id, front: `card ${tag}`, back: "{}", dueAt: new Date() } });
  await prisma.srsReview.create({ data: { streamId, cardId: card.id, rating: 3, elapsedDays: 1, retrievability: 0.9, recalled: true } });
  const sub = await prisma.submissionAttempt.create({ data: { streamId, kind: "PRODUCTION", lessonId: lesson.id, text: `essay ${tag}`, wordCount: 2, taskDifficulty: 60 } });
  await prisma.errorLog.create({ data: { streamId, submissionId: sub.id, category: "GRAMMAR", subtype: `SECRET_${tag}`, severity: "MODERATE", spanStart: 0, spanEnd: 1, original: "e", correction: "E", ruleEn: "r", ruleVi: "q" } });
  await prisma.practiceSession.create({ data: { streamId, mode: "DICTATION", level: "B1_1", topic: "t", itemsJson: {}, stateJson: {} } });
  await prisma.foundationProgress.create({ data: { streamId, deckId: "d", itemKey: "k", attempts: 1, correct: 1 } });
  await prisma.userProgress.upsert({ where: { streamId }, update: { lessonsCompleted: 1 }, create: { streamId, lessonsCompleted: 1 } });
  await prisma.userSettings.upsert({ where: { streamId }, update: { uiLocale: "vi" }, create: { streamId, uiLocale: "vi" } });
}

const ISOLATED_COUNTS = (streamId: string) =>
  Promise.all([
    prisma.proficiencyProfile.count({ where: { streamId } }), prisma.proficiencySnapshot.count({ where: { streamId } }), prisma.diagnosticAssessment.count({ where: { streamId } }),
    prisma.learningGoal.count({ where: { streamId } }), prisma.roadmapMilestone.count({ where: { streamId } }), prisma.lessonUnit.count({ where: { streamId } }),
    prisma.lexicalChunk.count({ where: { streamId } }), prisma.srsCard.count({ where: { streamId } }), prisma.srsReview.count({ where: { streamId } }),
    prisma.submissionAttempt.count({ where: { streamId } }), prisma.errorLog.count({ where: { streamId } }), prisma.practiceSession.count({ where: { streamId } }),
    prisma.foundationProgress.count({ where: { streamId } }), prisma.userProgress.count({ where: { streamId } }),
  ]);

describe("per-stream full reset", () => {
  beforeEach(async () => {
    await resetDb();
    setLlmClientForTesting(new ScriptedLlm([noLlm]));
  });
  afterAll(() => setLlmClientForTesting(null));

  it("wipes 100% of stream 000's learning data, keeps 001, shared tables and the session", async () => {
    const a = await testStream("000");
    const b = await testStream("001");
    await seedEverything(a.id, "A");
    await seedEverything(b.id, "B");
    const before001 = await ISOLATED_COUNTS(b.id);
    const ca = await cookieFor(a);

    const wrong = await resetPOST(req("/api/stream/reset", { cookie: ca, body: { confirmCode: "001" } }));
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error.code).toBe("RESET_CONFIRM_MISMATCH");
    expect((await ISOLATED_COUNTS(a.id)).every((n) => n > 0)).toBe(true); // nothing deleted on mismatch

    const ok = await resetPOST(req("/api/stream/reset", { cookie: ca, body: { confirmCode: "000", preserveLanguage: true } }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/lexiforge_locale=vi/);
    expect(await ISOLATED_COUNTS(a.id)).toEqual(Array(14).fill(0));
    expect((await prisma.userSettings.findUniqueOrThrow({ where: { streamId: a.id } })).uiLocale).toBe("vi");

    // Stream 001 untouched, shared tables untouched, 000 still logged in.
    expect(await ISOLATED_COUNTS(b.id)).toEqual(before001);
    expect(await prisma.errorLog.count({ where: { subtype: "SECRET_B" } })).toBe(1);
    expect(await prisma.dailyArticle.count()).toBe(1);
    expect(await prisma.sourceFeed.count()).toBe(1);
    expect(await prisma.explanationCache.count()).toBe(1);
    expect(await prisma.practicePromptCache.count()).toBe(1);
    expect(await prisma.streamAccount.count()).toBe(2);
    expect((await meGET(req("/api/stream/me", { cookie: ca }))).status).toBe(200);
    // Fresh learner: placement is open again.
    const diag = await (await diagnosticGET(req("/api/diagnostic", { cookie: ca }))).json();
    expect(diag).toMatchObject({ calibrated: false, placement: null, goal: null, hasRoadmap: false });
  });

  it("without preserveLanguage, settings return to defaults; unauthenticated resets are refused", async () => {
    const a = await testStream("000");
    await seedEverything(a.id, "A");
    await prisma.userSettings.update({ where: { streamId: a.id }, data: { uiLocale: "en" } });
    const r = await resetPOST(req("/api/stream/reset", { cookie: await cookieFor(a), body: { confirmCode: "000" } }));
    expect(r.status).toBe(200);
    expect(await prisma.userSettings.count({ where: { streamId: a.id } })).toBe(0);
    expect((await resetPOST(req("/api/stream/reset", { body: { confirmCode: "000" } }))).status).toBe(401);
  });
});

describe("onboarding retake & roadmap initialization", () => {
  beforeEach(async () => {
    await resetDb();
    setLlmClientForTesting(new ScriptedLlm([noLlm]));
  });

  it("onboarding access rule: never traps calibrated streams without a roadmap, honours ?retake=1", () => {
    expect(onboardingAccess({ calibrated: false, hasRoadmap: false, retake: false, inProgress: false })).toBe("ALLOW");
    expect(onboardingAccess({ calibrated: true, hasRoadmap: false, retake: false, inProgress: false })).toBe("ALLOW");
    expect(onboardingAccess({ calibrated: true, hasRoadmap: true, retake: true, inProgress: false })).toBe("ALLOW");
    expect(onboardingAccess({ calibrated: true, hasRoadmap: true, retake: false, inProgress: true })).toBe("ALLOW");
    expect(onboardingAccess({ calibrated: true, hasRoadmap: true, retake: false, inProgress: false })).toBe("REDIRECT_HOME");
    expect(isRetake("?retake=1")).toBe(true);
    expect(isRetake("?retake=0")).toBe(false);
  });

  it("a pre-roadmap stream (profile, no goal) gets two options and POST /api/roadmap/initialize builds it with zero LLM calls", async () => {
    const a = await testStream("000");
    const ca = await cookieFor(a);
    await prisma.proficiencyProfile.create({ data: { streamId: a.id, subBand: "B1_1", ieltsEstimate: 5, ieltsLow: 4.5, ieltsHigh: 5.5, gai: 70, lri: 60, cpr: 70, rss: 0, eri: 100, composite: 66, abilityLevel: 56 } });
    await prisma.diagnosticAssessment.create({ data: { streamId: a.id, kind: "PLACEMENT", status: "COMPLETED", itemsJson: {} } });

    const empty = await (await roadmapGET(req("/api/roadmap", { cookie: ca }))).json();
    expect(empty).toEqual({ ready: false, hasGoal: false, calibrated: true, currentSubBand: "B1_1" });
    const diag = await (await diagnosticGET(req("/api/diagnostic", { cookie: ca }))).json();
    expect(onboardingAccess({ calibrated: diag.calibrated, hasRoadmap: diag.hasRoadmap, retake: false, inProgress: false })).toBe("ALLOW");

    const bad = await initPOST(req("/api/roadmap/initialize", { cookie: ca, body: { targetSubBand: "Z9", dailyMinutes: 30 } }));
    expect(bad.status).toBe(422);
    const r = await initPOST(req("/api/roadmap/initialize", { cookie: ca, body: { targetSubBand: "B2_2", dailyMinutes: 45 } }));
    expect(r.status).toBe(200);
    const view = await r.json();
    expect(view.ready).toBe(true);
    expect(view.goal).toMatchObject({ startSubBand: "B1_1", targetSubBand: "B2_2", dailyMinutes: 45 });
    expect(view.milestones.map((m: { toBand: string }) => m.toBand)).toEqual(["B1_2", "B2_1", "B2_2"]);
    expect(view.milestones[0].status).toBe("ACTIVE");
    // Another stream sees none of it.
    const b = await testStream("001");
    expect(await prisma.roadmapMilestone.count({ where: { streamId: b.id } })).toBe(0);
  });

  it("a calibrated stream can start a retake (?retake=1 → setup) without being bounced", async () => {
    const a = await testStream("000");
    const ca = await cookieFor(a);
    await prisma.proficiencyProfile.create({ data: { streamId: a.id, subBand: "B1_1", ieltsEstimate: 5, ieltsLow: 4.5, ieltsHigh: 5.5, gai: 70, lri: 60, cpr: 70, rss: 0, eri: 100, composite: 66, abilityLevel: 56 } });
    await prisma.diagnosticAssessment.create({ data: { streamId: a.id, kind: "PLACEMENT", status: "COMPLETED", itemsJson: {} } });
    const r = await diagnosticPOST(req("/api/diagnostic", { cookie: ca, body: { action: "setup", comfortTier: 0, targetSubBand: "B2_2", dailyMinutes: 30 } }));
    expect(r.status).toBe(200);
    const step = await r.json();
    expect(step.phase).toBe("OBJECTIVE");
    expect(step.tier).toBe(0);
    expect(await prisma.diagnosticAssessment.count({ where: { streamId: a.id, status: "IN_PROGRESS" } })).toBe(1);
  });
});

describe("rate-limit responses", () => {
  it("map to 429 with Retry-After and exact retryAfterSeconds for the UI countdown", async () => {
    const res = await handle(async () => {
      throw new AllProvidersExhaustedError(23);
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("23");
    expect((await res.json()).error).toMatchObject({ code: "LLM_RATE_LIMIT", details: { retryAfterSeconds: 23 } });
  });
});

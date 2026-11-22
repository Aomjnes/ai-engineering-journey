import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_STREAMS, RATE_LIMIT_MAX_FAILURES } from "@/lib/auth/stream";
import { signSession, verifySession } from "@/lib/auth/session";
import { POST as enterPOST } from "@/app/api/stream/enter/route";
import { GET as meGET, PATCH as mePATCH } from "@/app/api/stream/me/route";
import { GET as dashboardGET } from "@/app/api/dashboard/route";
import { GET as lessonGET } from "@/app/api/lessons/[id]/route";
import { GET as srsGET, POST as srsPOST } from "@/app/api/srs/route";
import { POST as evaluatePOST } from "@/app/api/evaluate/route";
import { GET as accountabilityGET } from "@/app/api/accountability/route";
import { POST as diagnosticPOST } from "@/app/api/diagnostic/route";
import { resetEnvCache } from "@/lib/env";
import { resetDb, testStream } from "../helpers/db";
import { cookieFor, req, TEST_SECRET } from "../helpers/session";

const enter = (code: string, ip = "203.0.113.7") => enterPOST(req("/api/stream/enter", { body: { code }, headers: { "x-forwarded-for": ip } }));

async function seedPrivateData(streamId: string, tag: string) {
  await prisma.proficiencyProfile.create({ data: { streamId, subBand: "B1_2", ieltsEstimate: 5.5, ieltsLow: 5, ieltsHigh: 6, gai: 70, lri: 60, cpr: 70, rss: 0, eri: 100, composite: 66, abilityLevel: 44 } });
  const feed = await prisma.sourceFeed.upsert({ where: { url: "https://e.com/rss" }, update: {}, create: { name: "E", url: "https://e.com/rss", homepage: "https://e.com", topic: "t" } });
  const article = await prisma.dailyArticle.upsert({
    where: { urlHash: "shared-article" },
    update: {},
    create: { feedId: feed.id, urlHash: "shared-article", url: "https://e.com/a", title: "Shared", content: "Shared text.", wordCount: 300, sentenceCount: 10, fleschKincaidGrade: 10, fleschReadingEase: 50, avgSentenceLength: 20, avgSyllablesPerWord: 1.5, lexicalSophistication: 0.2, cefrTier: "B2", difficultyScore: 50 },
  });
  const lesson = await prisma.lessonUnit.create({
    data: { streamId, articleId: article.id, targetSubBand: "B1_2", difficultyScore: 50, isGraded: false, readingText: `Private reading ${tag}.`, authenticExcerpt: "x", comprehensibility: 0.9, grammarInWild: [], questions: [{ id: "q1", type: "inference", prompt: "Why would this matter here?", rubric: ["one", "two"] }], productionPrompt: `Prompt ${tag} for the production task.` },
  });
  const card = await prisma.srsCard.create({ data: { streamId, front: `secret chunk ${tag}`, back: JSON.stringify({ meaningVi: "x", meaningEn: "x", sentence: `secret chunk ${tag} here` }), state: "REVIEW", stability: 2, lastReviewAt: new Date(Date.now() - 3 * 86_400_000), dueAt: new Date(Date.now() - 86_400_000) } });
  const sub = await prisma.submissionAttempt.create({ data: { streamId, kind: "PRODUCTION", text: `private essay ${tag}`, wordCount: 3, taskDifficulty: 40 } });
  await prisma.errorLog.create({ data: { streamId, submissionId: sub.id, category: "GRAMMAR", subtype: `SECRET_${tag}`, severity: "MODERATE", spanStart: 0, spanEnd: 1, original: "p", correction: "P", ruleEn: "r", ruleVi: "q" } });
  return { lesson, card };
}

describe("5-stream access control", () => {
  beforeEach(async () => {
    await resetDb();
    resetEnvCache();
  });

  it("accepts allowed codes, lazily creates the stream and sets a hardened signed cookie", async () => {
    const res = await enter("000");
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^lexiforge_stream=[^;]+\..+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
    const token = /lexiforge_stream=([^;]+)/.exec(setCookie)?.[1] ?? "";
    const payload = await verifySession(token, TEST_SECRET);
    const stream = await prisma.streamAccount.findUniqueOrThrow({ where: { code: "000" } });
    expect(payload?.sid).toBe(stream.id);
    expect(stream.label).toBe("Stream 000");
    expect((await res.json()).stream).toEqual({ code: "000", label: "Stream 000" });
  });

  it("rejects codes outside ALLOWED_STREAM_CODES with 403 and never creates them", async () => {
    const res = await enter("999");
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("INVALID_CODE");
    expect(await prisma.streamAccount.count()).toBe(0);
  });

  it("never exceeds the hard cap of 5 streams", async () => {
    for (const c of ["000", "001", "002", "003", "004"]) expect((await enter(c)).status).toBe(200);
    expect(await prisma.streamAccount.count()).toBe(MAX_STREAMS);
    // Even if a sixth code were configured, creation is refused.
    process.env.ALLOWED_STREAM_CODES = "000,001,002,003,005";
    resetEnvCache();
    const r = await enter("005");
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("STREAM_CAP");
    expect(await prisma.streamAccount.count()).toBe(5);
    process.env.ALLOWED_STREAM_CODES = "000,001,002,003,004";
    resetEnvCache();
  });

  it("rate-limits failed attempts per IP (10 per 15 minutes)", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_FAILURES; i++) expect((await enter("999", "198.51.100.1")).status).toBe(403);
    const locked = await enter("000", "198.51.100.1");
    expect(locked.status).toBe(429);
    // Another IP is unaffected.
    expect((await enter("000", "198.51.100.2")).status).toBe(200);
  });

  it("rejects missing, tampered, expired and foreign-secret cookies with 401", async () => {
    const s = await testStream("000");
    expect((await meGET(req("/api/stream/me"))).status).toBe(401);
    const good = await cookieFor(s);
    expect((await meGET(req("/api/stream/me", { cookie: good }))).status).toBe(200);
    const [body, sig] = good.split("=")[1]!.split(".");
    const forged = Buffer.from(JSON.stringify({ sid: s.id, code: "001", exp: 9999999999 })).toString("base64url");
    expect((await meGET(req("/api/stream/me", { cookie: `lexiforge_stream=${forged}.${sig}` }))).status).toBe(401);
    expect((await meGET(req("/api/stream/me", { cookie: `lexiforge_stream=${body}.${sig}x` }))).status).toBe(401);
    expect((await meGET(req("/api/stream/me", { cookie: await cookieFor(s, -10) }))).status).toBe(401);
    const otherSecret = await signSession({ sid: s.id, code: "000", exp: 9999999999 }, "another-secret-another-secret-another-secret!!");
    expect((await meGET(req("/api/stream/me", { cookie: `lexiforge_stream=${otherSecret}` }))).status).toBe(401);
  });

  it("renames only the label; the code is immutable", async () => {
    const s = await testStream("000");
    const r = await mePATCH(req("/api/stream/me", { method: "PATCH", cookie: await cookieFor(s), body: { label: "Laptop & phone", code: "999" } }));
    expect(r.status).toBe(200);
    const after = await prisma.streamAccount.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.label).toBe("Laptop & phone");
    expect(after.code).toBe("000");
  });
});

describe("stream data isolation (000 vs 001)", () => {
  beforeEach(resetDb);

  it("000 can neither read nor mutate 001's data", async () => {
    const a = await testStream("000");
    const b = await testStream("001");
    await seedPrivateData(a.id, "A");
    const bData = await seedPrivateData(b.id, "B");
    const ca = await cookieFor(a);

    // Dashboard & graveyard only show own data.
    const dash = await (await dashboardGET(req("/api/dashboard", { cookie: ca }))).json();
    expect(JSON.stringify(dash)).not.toContain("SECRET_B");
    const acc = await (await accountabilityGET(req("/api/accountability", { cookie: ca }))).json();
    expect(JSON.stringify(acc)).toContain("SECRET_A");
    expect(JSON.stringify(acc)).not.toContain("SECRET_B");

    // Direct object access by id is a 404, never a leak.
    const foreignLesson = await lessonGET(req(`/api/lessons/${bData.lesson.id}`, { cookie: ca }), { params: Promise.resolve({ id: bData.lesson.id }) });
    expect(foreignLesson.status).toBe(404);
    const srs = await (await srsGET(req("/api/srs", { cookie: ca }))).json();
    expect(JSON.stringify(srs)).not.toContain("secret chunk B");
    const review = await srsPOST(req("/api/srs", { cookie: ca, body: { cardId: bData.card.id, typed: "secret chunk B", responseMs: 1000 } }));
    expect(review.status).toBe(404);
    const write = await evaluatePOST(req("/api/evaluate", { cookie: ca, body: { stage: "INPUT", lessonId: bData.lesson.id, transcript: "Private reading B." } }));
    expect(write.status).toBe(404);
    const foreignDiag = await diagnosticPOST(req("/api/diagnostic", { cookie: ca, body: { action: "write", assessmentId: "does-not-exist", text: "x" } }));
    expect(foreignDiag.status).toBe(404);

    // 001's rows are untouched.
    const card = await prisma.srsCard.findUniqueOrThrow({ where: { id: bData.card.id } });
    expect(card.reps).toBe(0);
    const lesson = await prisma.lessonUnit.findUniqueOrThrow({ where: { id: bData.lesson.id } });
    expect(lesson.stage).toBe("INPUT");
    expect(await prisma.srsReview.count()).toBe(0);
  });

  it("cascades deletion of a stream to all of its isolated rows only", async () => {
    const a = await testStream("000");
    const b = await testStream("001");
    await seedPrivateData(a.id, "A");
    await seedPrivateData(b.id, "B");
    await prisma.streamAccount.delete({ where: { id: a.id } });
    expect(await prisma.errorLog.count({ where: { streamId: a.id } })).toBe(0);
    expect(await prisma.errorLog.count({ where: { streamId: b.id } })).toBe(1);
    expect(await prisma.dailyArticle.count()).toBe(1); // shared content survives
  });
});

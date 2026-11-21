import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { extractArticle, normalizeUrl, parseFeedXml, urlHash } from "@/lib/ingest/extract";
import { runIngestion } from "@/lib/ingest/pipeline";
import { profileText } from "@/lib/metrics/readability";
import { resetDb } from "../helpers/db";
import { ARTICLE_PARAGRAPHS, articleHtml, rssXml } from "../fixtures/article";

let server: Server;
let base = "";
const hits: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    hits.push(path);
    if (path === "/feed.xml") {
      const now = new Date().toUTCString();
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end(rssXml(base, [{ path: "/news/harbour-classrooms", title: "Harbour warehouses to become floating classrooms", date: now }, { path: "/news/short", title: "Short item", date: now }, { path: "/news/missing", title: "Missing page", date: now }]));
    } else if (path === "/news/harbour-classrooms") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(articleHtml("Harbour warehouses to become floating classrooms"));
    } else if (path === "/news/short") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body><article><p>Too short to teach from.</p></article></body></html>");
    } else if (path === "/broken.xml") {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end("<rss><channel><item><title>unterminated");
    } else {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  await resetDb();
  hits.length = 0;
});

describe("extraction primitives", () => {
  it("normalizes URLs for dedupe", () => {
    expect(normalizeUrl("https://WWW.Example.com/a/b/?utm_source=x&id=2#top")).toBe("https://www.example.com/a/b?id=2");
    expect(urlHash("https://example.com/a?utm_medium=rss")).toBe(urlHash("https://example.com/a"));
  });

  it("extracts clean article text without page chrome", () => {
    const a = extractArticle(articleHtml("T"), "https://example.com/x");
    expect(a).not.toBeNull();
    expect(a?.text).toContain(ARTICLE_PARAGRAPHS[0]);
    expect(a?.text).not.toMatch(/Advertisement|Most read|Copyright|Home/);
    expect(a?.text.split("\n\n")).toHaveLength(ARTICLE_PARAGRAPHS.length);
  });

  it("parses RSS and validates items", async () => {
    const items = await parseFeedXml(rssXml("https://e.com", [{ path: "/1", title: "One", date: "Tue, 10 Mar 2026 10:00:00 GMT" }]));
    expect(items).toHaveLength(1);
    expect(items[0]?.publishedAt?.toISOString()).toBe("2026-03-10T10:00:00.000Z");
  });
});

describe("ingestion pipeline over real HTTP", () => {
  it("fetches, extracts, profiles, dedupes and tolerates dead feeds", async () => {
    await prisma.sourceFeed.createMany({
      data: [
        { name: "Local Feed", url: `${base}/feed.xml`, homepage: base, topic: "test" },
        { name: "Dead Feed", url: `${base}/does-not-exist.xml`, homepage: base, topic: "test" },
        { name: "Broken Feed", url: `${base}/broken.xml`, homepage: base, topic: "test" },
      ],
    });
    const report = await runIngestion();
    expect(report.stored).toBe(1);
    const local = report.feeds.find((f) => f.feed === "Local Feed");
    expect(local?.ok).toBe(true);
    expect(local?.skipped.map((s) => s.reason).join(" ")).toMatch(/too short/);
    expect(local?.skipped.map((s) => s.reason).join(" ")).toMatch(/HTTP 404/);
    expect(report.feeds.find((f) => f.feed === "Dead Feed")?.ok).toBe(false);
    expect(report.feeds.find((f) => f.feed === "Broken Feed")?.ok).toBe(false);

    const article = await prisma.dailyArticle.findFirstOrThrow();
    const expected = profileText(article.content);
    expect(article.difficultyScore).toBe(expected.difficultyScore);
    expect(article.fleschKincaidGrade).toBe(expected.fleschKincaidGrade);
    expect(["B1", "B2", "C1"]).toContain(article.cefrTier);
    expect(article.url).toContain("/news/harbour-classrooms");
    expect(article.publishedAt).not.toBeNull();

    // Second run: URL-hash dedupe means no new rows and no refetch of the stored article page.
    hits.length = 0;
    const again = await runIngestion();
    expect(again.stored).toBe(0);
    expect(again.feeds.find((f) => f.feed === "Local Feed")?.duplicates).toBe(1);
    expect(hits.filter((h) => h === "/news/harbour-classrooms")).toHaveLength(0);
    expect(await prisma.dailyArticle.count()).toBe(1);

    // Three consecutive failures mark a feed FAILING (dead-feed tolerance).
    await runIngestion();
    const dead = await prisma.sourceFeed.findFirstOrThrow({ where: { name: "Dead Feed" } });
    expect(dead.consecutiveFailures).toBe(3);
    expect(dead.status).toBe("FAILING");
  });

  it("shares one run between concurrent triggers", async () => {
    await prisma.sourceFeed.create({ data: { name: "Local Feed", url: `${base}/feed.xml`, homepage: base, topic: "test" } });
    const [a, b] = await Promise.all([runIngestion(), runIngestion()]);
    expect(a).toBe(b);
    expect(await prisma.dailyArticle.count()).toBe(1);
  });
});

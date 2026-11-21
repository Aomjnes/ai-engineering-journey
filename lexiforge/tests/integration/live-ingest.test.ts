/**
 * LIVE network test: real RSS feeds and article pages. Run with `npm run test:live`.
 * Requires outbound HTTPS to the feed hosts listed in src/lib/ingest/feeds.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DEFAULT_FEEDS } from "@/lib/ingest/feeds";
import { extractArticle, parseFeedXml } from "@/lib/ingest/extract";
import { runIngestion } from "@/lib/ingest/pipeline";
import { profileText } from "@/lib/metrics/readability";
import { resetDb } from "../helpers/db";

describe("live ingestion", () => {
  beforeAll(async () => {
    await resetDb();
  });

  it("parses at least half of the default feeds", async () => {
    let ok = 0;
    const failures: string[] = [];
    for (const f of DEFAULT_FEEDS) {
      try {
        const res = await fetch(f.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; LexiForge/0.1)" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const items = await parseFeedXml(await res.text());
        if (items.length > 0) ok++;
      } catch (e) {
        failures.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    expect(ok, failures.join("\n")).toBeGreaterThanOrEqual(Math.ceil(DEFAULT_FEEDS.length / 2));
  }, 120_000);

  it("extracts and profiles a real article end to end", async () => {
    const res = await fetch(DEFAULT_FEEDS[4].url);
    const items = await parseFeedXml(await res.text());
    let profiled = false;
    for (const item of items.slice(0, 5)) {
      const page = await fetch(item.link);
      if (!page.ok) continue;
      const art = extractArticle(await page.text(), item.link);
      if (!art) continue;
      const p = profileText(art.text);
      if (p.wordCount < 200) continue;
      expect(p.fleschKincaidGrade).toBeGreaterThan(4);
      expect(["A2", "B1", "B2", "C1"]).toContain(p.cefrTier);
      profiled = true;
      break;
    }
    expect(profiled).toBe(true);
  }, 120_000);

  it("runs the full pipeline and stores deduplicated, profiled articles", async () => {
    const report = await runIngestion();
    expect(report.stored).toBeGreaterThan(0);
    const articles = await prisma.dailyArticle.findMany();
    expect(new Set(articles.map((a) => a.urlHash)).size).toBe(articles.length);
    for (const a of articles) expect(a.wordCount).toBeGreaterThanOrEqual(250);
  }, 300_000);
});

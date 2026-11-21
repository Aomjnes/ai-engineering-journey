import type { SourceFeed } from "@prisma/client";
import { prisma } from "@/lib/db";
import { profileText } from "@/lib/metrics/readability";
import { DEFAULT_FEEDS } from "./feeds";
import { extractArticle, parseFeedXml, urlHash } from "./extract";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const INGEST_LIMITS = {
  itemsPerFeed: 4,
  maxItemAgeHours: 72,
  minWords: 250,
  maxWords: 6000,
  minDifficulty: 20,
  timeoutMs: 15000,
  failuresBeforeFailing: 3,
} as const;

const USER_AGENT = "Mozilla/5.0 (compatible; LexiForge/0.1; personal language-learning reader)";

export class FetchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function fetchText(fetchImpl: FetchLike, url: string, accept: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INGEST_LIMITS.timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: accept }, signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new FetchError(`HTTP ${res.status} for ${url}`, res.status);
    return await res.text();
  } catch (e) {
    if (e instanceof FetchError) throw e;
    const msg = e instanceof Error ? (e.name === "AbortError" ? `timeout after ${INGEST_LIMITS.timeoutMs}ms` : e.message) : String(e);
    throw new FetchError(`${msg} (${url})`);
  } finally {
    clearTimeout(timer);
  }
}

export interface FeedReport {
  feed: string;
  ok: boolean;
  error?: string;
  considered: number;
  stored: number;
  duplicates: number;
  skipped: Array<{ url: string; reason: string }>;
}

export interface IngestReport {
  startedAt: string;
  finishedAt: string;
  stored: number;
  feeds: FeedReport[];
}

/** Ensures default feeds exist (idempotent). */
export async function ensureFeeds(): Promise<void> {
  const count = await prisma.sourceFeed.count();
  if (count > 0) return;
  for (const f of DEFAULT_FEEDS) await prisma.sourceFeed.upsert({ where: { url: f.url }, update: {}, create: { ...f } });
}

async function ingestFeed(feed: SourceFeed, fetchImpl: FetchLike, now: Date): Promise<FeedReport> {
  const report: FeedReport = { feed: feed.name, ok: true, considered: 0, stored: 0, duplicates: 0, skipped: [] };
  let items;
  try {
    const xml = await fetchText(fetchImpl, feed.url, "application/rss+xml, application/atom+xml, application/xml, text/xml");
    items = await parseFeedXml(xml);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const failures = feed.consecutiveFailures + 1;
    await prisma.sourceFeed.update({
      where: { id: feed.id },
      data: { consecutiveFailures: failures, lastError: message.slice(0, 500), lastFetchedAt: now, status: failures >= INGEST_LIMITS.failuresBeforeFailing ? "FAILING" : feed.status },
    });
    return { ...report, ok: false, error: message };
  }
  const cutoff = now.getTime() - INGEST_LIMITS.maxItemAgeHours * 3_600_000;
  const fresh = items
    .filter((i) => !i.publishedAt || i.publishedAt.getTime() >= cutoff)
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  for (const item of fresh) {
    if (report.stored >= INGEST_LIMITS.itemsPerFeed) break;
    report.considered++;
    const hash = urlHash(item.link);
    if (await prisma.dailyArticle.findUnique({ where: { urlHash: hash }, select: { id: true } })) {
      report.duplicates++;
      continue;
    }
    try {
      const html = await fetchText(fetchImpl, item.link, "text/html,application/xhtml+xml");
      const article = extractArticle(html, item.link);
      if (!article) {
        report.skipped.push({ url: item.link, reason: "no extractable article body" });
        continue;
      }
      const profile = profileText(article.text);
      if (profile.wordCount < INGEST_LIMITS.minWords) {
        report.skipped.push({ url: item.link, reason: `too short (${profile.wordCount} words)` });
        continue;
      }
      if (profile.wordCount > INGEST_LIMITS.maxWords) {
        report.skipped.push({ url: item.link, reason: `too long (${profile.wordCount} words)` });
        continue;
      }
      if (profile.difficultyScore < INGEST_LIMITS.minDifficulty) {
        report.skipped.push({ url: item.link, reason: `too thin for B1+ (D=${profile.difficultyScore})` });
        continue;
      }
      await prisma.dailyArticle.create({
        data: {
          feedId: feed.id,
          urlHash: hash,
          url: item.link,
          title: item.title || article.title,
          byline: article.byline,
          excerpt: article.excerpt ?? item.summary,
          content: article.text,
          publishedAt: item.publishedAt,
          ingestedAt: now,
          wordCount: profile.wordCount,
          sentenceCount: profile.sentenceCount,
          fleschKincaidGrade: profile.fleschKincaidGrade,
          fleschReadingEase: profile.fleschReadingEase,
          avgSentenceLength: profile.avgSentenceLength,
          avgSyllablesPerWord: profile.avgSyllablesPerWord,
          lexicalSophistication: profile.lexicalSophistication,
          cefrTier: profile.cefrTier === "A2" ? "B1" : profile.cefrTier,
          difficultyScore: profile.difficultyScore,
        },
      });
      report.stored++;
    } catch (e) {
      report.skipped.push({ url: item.link, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  await prisma.sourceFeed.update({
    where: { id: feed.id },
    data: { consecutiveFailures: 0, lastError: null, lastFetchedAt: now, status: feed.status === "DISABLED" ? "DISABLED" : "ACTIVE" },
  });
  return report;
}

let running: Promise<IngestReport> | null = null;

/**
 * Daily ingestion across all non-disabled feeds. Dead feeds are recorded and skipped, never fatal.
 * Concurrent calls share one run (cron + manual button cannot double-ingest).
 */
export function runIngestion(opts: { fetchImpl?: FetchLike; now?: Date; concurrency?: number } = {}): Promise<IngestReport> {
  if (running) return running;
  const exec = async (): Promise<IngestReport> => {
    const now = opts.now ?? new Date();
    const fetchImpl = opts.fetchImpl ?? fetch;
    await ensureFeeds();
    const feeds = await prisma.sourceFeed.findMany({ where: { status: { not: "DISABLED" } }, orderBy: { name: "asc" } });
    const reports: FeedReport[] = [];
    const queue = [...feeds];
    const workers = Array.from({ length: Math.max(1, opts.concurrency ?? 3) }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) reports.push(await ingestFeed(f, fetchImpl, now));
    });
    await Promise.all(workers);
    reports.sort((a, b) => a.feed.localeCompare(b.feed));
    return { startedAt: now.toISOString(), finishedAt: new Date().toISOString(), stored: reports.reduce((a, r) => a + r.stored, 0), feeds: reports };
  };
  running = exec().finally(() => {
    running = null;
  });
  return running;
}

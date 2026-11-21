import { createHash } from "node:crypto";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import Parser from "rss-parser";
import { z } from "zod";

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref$|cmp$|at_medium|at_campaign|ocid)/i;

/** Canonical form used for deduplication: lowercase host, no hash, no tracking params, no trailing slash. */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

export function urlHash(raw: string): string {
  return createHash("sha256").update(normalizeUrl(raw)).digest("hex");
}

export const FeedItemSchema = z.object({
  link: z.string().url(),
  title: z.string().min(1),
  publishedAt: z.date().nullable(),
  summary: z.string().nullable(),
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

const parser = new Parser({ timeout: 15000 });

/** Parses RSS/Atom XML into validated items. Invalid items are skipped, never thrown. */
export async function parseFeedXml(xml: string): Promise<FeedItem[]> {
  const feed = await parser.parseString(xml);
  const out: FeedItem[] = [];
  for (const item of feed.items ?? []) {
    const dateRaw = item.isoDate ?? item.pubDate;
    const date = dateRaw ? new Date(dateRaw) : null;
    const parsed = FeedItemSchema.safeParse({
      link: item.link?.trim(),
      title: item.title?.trim(),
      publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
      summary: item.contentSnippet?.trim() || null,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export interface ExtractedArticle {
  title: string;
  byline: string | null;
  excerpt: string | null;
  text: string;
}

const BOILERPLATE = /^(advertisement|read more|related:|sign up|subscribe|image source|image caption|getty images|copyright|share this|follow us)/i;

/** Readability extraction → clean plain text with paragraph breaks. Returns null when no article body is found. */
export function extractArticle(html: string, url: string): ExtractedArticle | null {
  const virtualConsole = new VirtualConsole(); // swallow CSS/script parse noise from real pages
  const dom = new JSDOM(html, { url, virtualConsole });
  try {
    const parsed = new Readability(dom.window.document).parse();
    if (!parsed?.content) return null;
    const body = new JSDOM(parsed.content, { virtualConsole }).window.document;
    const blocks = [...body.querySelectorAll("p, h2, h3, li, blockquote")]
      .filter((el) => !el.closest("li p") && !(el.tagName === "LI" && el.querySelector("p")))
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 0 && !BOILERPLATE.test(t));
    const paragraphs = blocks.filter((t) => t.split(" ").length >= 6 || /[.!?]$/.test(t));
    const text = (paragraphs.length ? paragraphs : [(parsed.textContent ?? "").replace(/\s+/g, " ").trim()]).join("\n\n");
    if (!text) return null;
    return { title: (parsed.title ?? "").trim(), byline: parsed.byline?.trim() || null, excerpt: parsed.excerpt?.trim() || null, text };
  } finally {
    dom.window.close();
  }
}

// Food safety news and agency notices from RSS feeds. We store only the title, link,
// publisher, date, and a short excerpt. Each feed fails independently.

import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { fetchText } from "../lib/http.js";
import { daysAgo } from "../lib/dates.js";
import { clean, stripHtml, truncate } from "../lib/text.js";
import type { NewsItem, NewsKind, SourceStatus } from "../types.js";

export interface Feed {
  key: string;
  name: string;
  url: string;
  kind: NewsKind;
  /** Only keep items matching this (used for feeds that cover more than food). */
  filter?: RegExp;
}

export const FOOD_TOPIC = /\b(food|recall|outbreak|listeria|salmonella|e\.? ?coli|produce|infant formula|contaminat|allergen|fsis|foodborne|hepatitis a|norovirus|cyclospora|botulism|dairy|milk|meat|poultry|seafood|lettuce|eggs?)\b/i;

export const FEEDS: Feed[] = [
  { key: "foodsafetynews", name: "Food Safety News", url: "https://www.foodsafetynews.com/feed/", kind: "news" },
  { key: "fda-recalls", name: "FDA recall notice", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/food-safety-recalls/rss.xml", kind: "agency-notice" },
  { key: "fda-outbreaks", name: "FDA outbreak notice", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/fda-outbreaks/rss.xml", kind: "agency-notice" },
  { key: "fda-press", name: "FDA press release", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml", kind: "agency-notice", filter: FOOD_TOPIC },
  { key: "google-news", name: "Google News", url: "https://news.google.com/rss/search?q=%22foodborne+outbreak%22+OR+%22food+recall%22&hl=en-US&gl=US&ceid=US:en", kind: "news" },
];

export function normalizeUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
}

export function newsId(url: string): string {
  return createHash("sha1").update(normalizeUrl(url)).digest("hex").slice(0, 16);
}

export function parseFeed(xml: string, feed: Feed, fetchedAt: string): NewsItem[] {
  const $ = cheerio.load(xml, { xml: true });
  const items: NewsItem[] = [];
  $("item").each((_, el) => {
    const $el = $(el);
    let title = clean($el.find("title").first().text());
    const url = clean($el.find("link").first().text());
    if (!title || !url) return;
    const pub = new Date(clean($el.find("pubDate").first().text()));
    if (isNaN(pub.getTime())) return;
    let source = feed.name;
    if (feed.key === "google-news") {
      // Google News titles end with " - Outlet" and items carry a <source> element.
      const outlet = clean($el.find("source").first().text());
      const m = title.match(/^(.*)\s+-\s+([^-]+)$/);
      if (m) title = m[1];
      source = outlet || (m ? m[2] : feed.name);
    }
    let excerpt = truncate(stripHtml($el.find("description").first().text()), 300);
    // Google News descriptions are just the headline again; keep the field empty instead.
    if (excerpt.replace(/\s+/g, " ").toLowerCase().startsWith(title.toLowerCase())) excerpt = "";
    if (feed.filter && !feed.filter.test(`${title} ${excerpt}`)) return;
    items.push({
      id: newsId(url),
      feed: feed.key,
      source,
      kind: feed.kind,
      title,
      url,
      publishedAt: pub.toISOString(),
      excerpt,
      fetchedAt,
    });
  });
  return items;
}

const normalizeTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Remove duplicates by link, and by identical headline from the same publisher (Google News
 *  serves one story under several redirect links). Prefers agency notices over news coverage. */
export function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, NewsItem>();
  const rank = (i: NewsItem) => (i.kind === "agency-notice" ? 0 : i.feed === "foodsafetynews" ? 1 : 2);
  const put = (key: string, item: NewsItem) => {
    const prev = seen.get(key);
    if (!prev || rank(item) < rank(prev)) seen.set(key, item);
  };
  for (const item of items) put(normalizeUrl(item.url), item);
  const byTitle = new Map<string, NewsItem>();
  for (const item of seen.values()) {
    const key = `${normalizeTitle(item.title)}|${item.source.toLowerCase()}`;
    const prev = byTitle.get(key);
    if (!prev || rank(item) < rank(prev) || (rank(item) === rank(prev) && item.publishedAt < prev.publishedAt)) byTitle.set(key, item);
  }
  return [...byTitle.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export interface FetchNewsResult {
  /** Items from feeds that succeeded this run, keyed by feed. */
  byFeed: Record<string, NewsItem[]>;
  sources: Record<string, SourceStatus>;
}

export async function fetchNews(opts: { days?: number; log?: (m: string) => void } = {}): Promise<FetchNewsResult> {
  const log = opts.log ?? (() => {});
  const since = daysAgo(opts.days ?? 30).toISOString();
  const byFeed: Record<string, NewsItem[]> = {};
  const sources: Record<string, SourceStatus> = {};
  await Promise.all(
    FEEDS.map(async (feed) => {
      const fetchedAt = new Date().toISOString();
      try {
        const xml = await fetchText(feed.url, { accept: "application/rss+xml,application/xml,text/xml,*/*" });
        const items = parseFeed(xml, feed, fetchedAt).filter((i) => i.publishedAt >= since);
        if (items.length === 0 && !/<item/.test(xml)) throw new Error("feed contained no items");
        byFeed[feed.key] = items;
        sources[`news-${feed.key}`] = { name: feed.name, url: feed.url, fetchedAt, ok: true, error: null, upstreamUpdated: null, itemCount: items.length };
        log(`news ${feed.key}: ${items.length} items in last ${opts.days ?? 30} days`);
      } catch (e) {
        const message = (e as Error).message;
        sources[`news-${feed.key}`] = { name: feed.name, url: feed.url, fetchedAt: null, ok: false, error: message, upstreamUpdated: null, itemCount: null };
        log(`news ${feed.key} FAILED: ${message}`);
      }
    }),
  );
  return { byFeed, sources };
}

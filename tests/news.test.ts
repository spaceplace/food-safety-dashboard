import { describe, expect, it } from "vitest";
import { fixture } from "./helpers.js";
import { FEEDS, dedupe, normalizeUrl, parseFeed } from "../fetch/sources/news.js";

const feed = (key: string) => FEEDS.find((f) => f.key === key)!;

describe("news feeds", () => {
  it("parses Food Safety News", () => {
    const items = parseFeed(fixture("news/foodsafetynews.xml"), feed("foodsafetynews"), "t");
    expect(items.length).toBeGreaterThan(5);
    expect(items[0]).toMatchObject({ feed: "foodsafetynews", source: "Food Safety News", kind: "news", title: "Supplier in sprout outbreak recalls seed" });
    expect(items[0].url).toMatch(/^https:\/\/www\.foodsafetynews\.com\//);
    expect(items[0].publishedAt).toBe("2026-09-16T04:05:04.000Z");
    expect(items[0].excerpt.length).toBeLessThanOrEqual(300);
  });
  it("parses FDA recall notices as agency notices", () => {
    const items = parseFeed(fixture("news/fda-recalls.xml"), feed("fda-recalls"), "t");
    expect(items.length).toBe(20);
    expect(items[0].kind).toBe("agency-notice");
    expect(items[0].title).toMatch(/So Delicious/);
    expect(items[0].excerpt).toMatch(/Danone/);
  });
  it("keeps only food-related FDA press releases", () => {
    const all = parseFeed(fixture("news/fda-press.xml"), { ...feed("fda-press"), filter: undefined }, "t");
    const food = parseFeed(fixture("news/fda-press.xml"), feed("fda-press"), "t");
    expect(all.length).toBe(20);
    expect(food.length).toBeLessThanOrEqual(all.length);
    for (const i of food) expect(`${i.title} ${i.excerpt}`).toMatch(feed("fda-press").filter!);
  });
  it("splits Google News titles into headline and outlet", () => {
    const items = parseFeed(fixture("news/googlenews.xml"), feed("google-news"), "t");
    expect(items.length).toBeGreaterThan(5);
    expect(items[0].title).toBe("Walmart announces nationwide food recall for health risk");
    expect(items[0].source).toBe("silive.com");
  });
  it("dedupes the same headline from the same outlet under different links", () => {
    const a = { id: "1", feed: "google-news", source: "SILive.com", kind: "news" as const, title: "Walmart announces recall", url: "https://news.google.com/rss/articles/AAA", publishedAt: "2026-09-16T13:00:00Z", excerpt: "", fetchedAt: "t" };
    const b = { ...a, id: "2", url: "https://news.google.com/rss/articles/BBB", publishedAt: "2026-09-16T15:00:00Z" };
    const out = dedupe([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("1");
  });
  it("leaves the excerpt empty when it only repeats the headline", () => {
    const items = parseFeed(fixture("news/googlenews.xml"), feed("google-news"), "t");
    expect(items[0].excerpt).toBe("");
  });
  it("dedupes by normalized URL, preferring agency notices", () => {
    const a = { id: "1", feed: "google-news", source: "X", kind: "news" as const, title: "A", url: "https://www.fda.gov/foo/?utm=1", publishedAt: "2026-09-10T00:00:00Z", excerpt: "", fetchedAt: "t" };
    const b = { ...a, id: "2", feed: "fda-recalls", kind: "agency-notice" as const, url: "http://fda.gov/foo" };
    expect(normalizeUrl(a.url)).toBe(normalizeUrl(b.url));
    const out = dedupe([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].feed).toBe("fda-recalls");
  });
});

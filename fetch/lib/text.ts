import * as cheerio from "cheerio";

/** Collapse whitespace and trim. */
export function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Strip HTML tags and entities, collapse whitespace. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  // Some agency fields are double-encoded ("&amp;amp;"), so decode until stable (at most twice).
  let text = clean(cheerio.load(`<div>${html}</div>`)("div").first().text());
  if (/&(#\d+|[a-z]+);/i.test(text)) text = clean(cheerio.load(`<div>${text}</div>`)("div").first().text());
  return text;
}

/** First integer found in a string, or null. Handles "1,234". */
export function firstInt(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

// Reads the JSON the fetch job wrote and derives everything the pages show.
// All "now" math happens at build time, so numbers are frozen to the build timestamp.

import outbreaksJson from "../../../data/outbreaks.json";
import recallsJson from "../../../data/recalls.json";
import statusJson from "../../../data/status.json";
import newsJson from "../../../data/news.json";
import summaryJson from "../../../data/summary.json";
import type { NewsFile, NewsItem, Outbreak, OutbreaksFile, Recall, RecallsFile, SourceStatus, StatusFile, SummaryFile } from "../../../fetch/types";

export const outbreaksFile = outbreaksJson as unknown as OutbreaksFile;
export const recallsFile = recallsJson as unknown as RecallsFile;
export const statusFile = statusJson as unknown as StatusFile;
export const newsFile = newsJson as unknown as NewsFile;
export const summaryFile = summaryJson as unknown as SummaryFile;

export const BUILD_TIME = new Date().toISOString();
const DAY = 86_400_000;

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
}

// ---------- Outbreaks ----------

export const allOutbreaks: Outbreak[] = outbreaksFile.items;

export const openOutbreaks: Outbreak[] = allOutbreaks
  .filter((o) => o.status === "active")
  .sort((a, b) => (b.updatedAt ?? b.postedAt ?? "").localeCompare(a.updatedAt ?? a.postedAt ?? ""));

export const unknownStatusOutbreaks: Outbreak[] = allOutbreaks.filter((o) => o.status === "unknown");

/** Outbreaks whose CDC notice was first posted in the trailing 12 months, open or closed. */
export const trailing12Outbreaks: Outbreak[] = allOutbreaks.filter((o) => o.postedAt && o.postedAt >= isoDaysAgo(365));

const sum = (items: Outbreak[], key: "cases" | "hospitalizations" | "deaths") =>
  items.reduce((acc, o) => acc + (o[key] ?? 0), 0);

export const headline = {
  illnesses: sum(trailing12Outbreaks, "cases"),
  hospitalizations: sum(trailing12Outbreaks, "hospitalizations"),
  deaths: sum(trailing12Outbreaks, "deaths"),
  outbreakCount: trailing12Outbreaks.length,
  /** Outbreaks where a number was missing and so counted as zero. */
  missingCounts: trailing12Outbreaks.filter((o) => o.cases === null || o.hospitalizations === null || o.deaths === null).length,
  largest: [...trailing12Outbreaks].sort((a, b) => (b.cases ?? 0) - (a.cases ?? 0))[0] ?? null,
};

// ---------- Recalls ----------

export const allRecalls: Recall[] = recallsFile.items;
export const recentRecalls = (days: number): Recall[] => allRecalls.filter((r) => r.reportDate && r.reportDate >= isoDaysAgo(days));

// ---------- Recently implicated foods (last 90 days) ----------

export interface FoodGroup {
  key: string;
  outbreaks: Outbreak[];
  recalls: Recall[];
  /** Most recent date any item in the group was posted or updated. */
  latest: string;
}

export function implicatedFoods(days = 90): FoodGroup[] {
  const since = isoDaysAgo(days);
  const groups = new Map<string, FoodGroup>();
  const touch = (key: string) => {
    if (!groups.has(key)) groups.set(key, { key, outbreaks: [], recalls: [], latest: "" });
    return groups.get(key)!;
  };
  for (const o of allOutbreaks) {
    const when = o.updatedAt ?? o.postedAt ?? "";
    if (when < since) continue;
    for (const k of o.foodKeys) {
      const g = touch(k);
      g.outbreaks.push(o);
      if (when > g.latest) g.latest = when;
    }
  }
  for (const r of allRecalls) {
    const when = r.reportDate ?? "";
    if (when < since) continue;
    for (const k of r.foodKeys) {
      const g = touch(k);
      g.recalls.push(r);
      if (when > g.latest) g.latest = when;
    }
  }
  return [...groups.values()].sort(
    (a, b) => b.outbreaks.length - a.outbreaks.length || b.recalls.length - a.recalls.length || b.latest.localeCompare(a.latest),
  );
}

/** Split food groups into the ones worth a card and the long tail. */
export function splitFoodGroups(groups: FoodGroup[], maxCards = 12): { cards: FoodGroup[]; rest: FoodGroup[] } {
  const cards = groups.filter((g) => g.outbreaks.length > 0 || g.recalls.length >= 3).slice(0, maxCards);
  const rest = groups.filter((g) => !cards.includes(g));
  return { cards, rest };
}

// ---------- News and the daily summary ----------

export const recentNews = (days: number): NewsItem[] =>
  newsFile.items.filter((i) => i.publishedAt >= new Date(Date.now() - days * DAY).toISOString());

/** Age of the current summary in days, or null if none exists. */
export function summaryAgeDays(): number | null {
  if (!summaryFile.generatedAt) return null;
  return (Date.now() - new Date(summaryFile.generatedAt).getTime()) / DAY;
}

/** Turn "[3]" and "[2, 5]" in summary text into HTML links to the numbered source list. */
export function renderCitations(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_m, nums: string) =>
    nums.split(",").map((n) => n.trim()).map((n) => `<a class="cite" href="#source-${n}" aria-label="Source ${n}">[${n}]</a>`).join(""),
  );
}

// ---------- Source status and warnings ----------

export const sources: Record<string, SourceStatus> = statusFile.sources;

export interface Warning {
  level: "warning" | "info";
  text: string;
}

export function dataWarnings(): Warning[] {
  const out: Warning[] = [];
  for (const s of Object.values(sources)) {
    if (!s.ok) {
      out.push({
        level: "warning",
        text: `${s.name} could not be refreshed (${s.error ?? "unknown error"}). Showing the last good data${s.fetchedAt ? `, fetched ${formatDateTime(s.fetchedAt)}` : ""}.`,
      });
    } else if (s.error) {
      out.push({ level: "info", text: `${s.name}: ${s.error}` });
    }
  }
  const ageHours = (Date.now() - new Date(statusFile.generatedAt).getTime()) / 3_600_000;
  if (ageHours > 30) {
    out.push({ level: "warning", text: `The data on this page was last refreshed ${formatDateTime(statusFile.generatedAt)}, more than a day ago. The scheduled update may have failed.` });
  }
  const age = summaryAgeDays();
  if (summaryFile.status === "failed" && summaryFile.note) {
    out.push({ level: "info", text: `The news summary could not be regenerated (${summaryFile.note}).${summaryFile.paragraphs.length ? " Showing the previous one." : ""}` });
  } else if (age !== null && age > 2) {
    out.push({ level: "info", text: `The news summary is ${Math.floor(age)} days old. It is normally rewritten every morning, so the scheduled update may have failed.` });
  }
  if (unknownStatusOutbreaks.length > 0) {
    out.push({ level: "info", text: `${unknownStatusOutbreaks.length} CDC outbreak notice(s) could not be classified as open or closed and are left out of the open outbreaks list.` });
  }
  return out;
}

// ---------- Formatting ----------

export function formatNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("en-US");
}

/** Compact for big numbers: 9,900,000 -> "9.9 million". */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} million`;
  return n.toLocaleString("en-US");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export const statusLabel: Record<Outbreak["status"], string> = { active: "Open", over: "Over", unknown: "Unknown" };

export const reasonLabel: Record<Recall["reasonCategory"], string> = {
  listeria: "Listeria",
  salmonella: "Salmonella",
  ecoli: "E. coli",
  "other-pathogen": "Other contamination",
  "undeclared-allergen": "Undeclared allergen",
  "foreign-material": "Foreign material",
  regulatory: "Regulatory",
  other: "Other",
};

export const categoryLabel: Record<Recall["category"], string> = {
  "human-food": "Food",
  "pet-food": "Pet food",
  "dietary-supplement": "Supplement",
};

/** Link helper that respects the GitHub Pages base path. Always pass a path starting with "/". */
export function href(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

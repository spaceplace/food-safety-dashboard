// The scheduled job. Fetches every source, each in its own try/catch, and writes data/*.json.
// If a source fails, its previous items are kept and its status records the error, so the
// site always has something honest to show.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCdcOutbreaks } from "./sources/cdc-outbreaks.js";
import { fetchCdcCounts } from "./sources/cdc-counts.js";
import { fetchOpenFda } from "./sources/fda-openfda.js";
import { fetchFsis } from "./sources/fsis-api.js";
import { FEEDS, dedupe, fetchNews } from "./sources/news.js";
import { buildSignals } from "./signals/build.js";
import type { ChangeLogFile, NewsFile, OutbreaksFile, Recall, RecallsFile, SignalsFile, SourceStatus, StatusFile } from "./types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "data");

// How much history each file keeps. The fetchers pull the widest window once; the narrower
// files are filtered from that, so nothing is fetched twice.
// The Signal Explorer dataset starts at a fixed date and keeps growing until it holds
// SIGNAL_MAX_YEARS, after which the oldest records age out.
const SIGNAL_START = "2021-01-01";
const SIGNAL_MAX_YEARS = 15;
const RECALLS_FDA_DAYS = 120; // recalls.json, as shown on the recalls page
const RECALLS_FSIS_DAYS = 365;

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, file), JSON.stringify(value, null, 2) + "\n");
}

/** Status entry for a failed fetch: keeps the previous fetchedAt so the site can say how stale the data is. */
function failedStatus(name: string, url: string, err: unknown, previous: SourceStatus | undefined): SourceStatus {
  const message = err instanceof Error ? err.message : String(err);
  log(`FAILED ${name}: ${message}`);
  return {
    name,
    url,
    fetchedAt: previous?.fetchedAt ?? null,
    ok: false,
    error: message,
    upstreamUpdated: previous?.upstreamUpdated ?? null,
    itemCount: previous?.itemCount ?? null,
  };
}

export async function run(): Promise<StatusFile> {
  const generatedAt = new Date().toISOString();
  const prevOutbreaks = await readJson<OutbreaksFile>("outbreaks.json");
  const prevRecalls = await readJson<RecallsFile>("recalls.json");
  const sources: Record<string, SourceStatus> = {};

  const thisYear = new Date(generatedAt).getUTCFullYear();
  const isoDaysAgo = (days: number) => new Date(Date.parse(generatedAt) - days * 86_400_000).toISOString().slice(0, 10);
  const maxYearsAgo = `${thisYear - SIGNAL_MAX_YEARS}${generatedAt.slice(4, 10)}`;
  const signalStart = maxYearsAgo > SIGNAL_START ? maxYearsAgo : SIGNAL_START;

  // --- CDC outbreaks ---
  const prevSignalsForCdc = await readJson<SignalsFile>("signals.json");
  const cdcCarryIds = new Set<string>(); // signals to keep from the previous build because their CDC page failed and outbreaks.json has no copy
  let outbreakItems = prevOutbreaks?.items ?? [];
  let cdcAll: OutbreaksFile["items"] | null = null; // the wider set for the signals dataset; null when the fetch failed
  try {
    const r = await fetchCdcOutbreaks({ log, minYear: Number(signalStart.slice(0, 4)) });
    // A notice whose detail page could not be fetched (CDC's bot protection sometimes rejects
    // requests partway through a run) comes back with every figure empty. Keep the previous
    // copy of that notice rather than publishing blanks; if there is no previous copy, leave it out.
    const prevById = new Map((prevSignalsForCdc?.items ?? []).map((s) => [s.id, s]));
    const prevOutbreakById = new Map((prevOutbreaks?.items ?? []).map((o) => [o.id, o]));
    const fetchFailed = (o: (typeof r.items)[number]) => o.parseWarnings.some((w) => /^index page:/.test(w));
    const failed = r.items.filter(fetchFailed);
    if (failed.length > 0) {
      log(`CDC: ${failed.length} notice page(s) could not be fetched; keeping previous copies where they exist`);
      r.source.error = `${failed.length} notice page(s) could not be fetched; showing previous data for them`;
    }
    cdcAll = r.items.flatMap((o) => {
      if (!fetchFailed(o)) return [o]; // includes notices CDC has removed, kept as minimal records
      const prev = prevOutbreakById.get(o.id);
      if (prev) return [prev];
      // Carry the previous signal only if it was ever fetched successfully; a notice that has
      // never been readable is left out rather than published as a blank record.
      const prevSignal = prevById.get(o.id);
      if (prevSignal && prevSignal.dates.reported) cdcCarryIds.add(o.id);
      return [];
    });
    outbreakItems = r.items.filter((o) => o.year !== null && o.year >= thisYear - 1);
    sources["cdc-outbreaks"] = r.source;
  } catch (e) {
    sources["cdc-outbreaks"] = failedStatus("CDC multistate foodborne outbreak notices", "https://www.cdc.gov/foodborne-outbreaks/outbreaks/", e, prevOutbreaks?.sources["cdc-outbreaks"]);
  }

  let activeCounts = prevOutbreaks?.activeInvestigationCounts ?? null;
  try {
    const r = await fetchCdcCounts();
    activeCounts = r.counts;
    sources["cdc-active-counts"] = r.source;
    log(`CDC active investigations: ${JSON.stringify(r.counts.counts)} as of ${r.counts.asOf}`);
  } catch (e) {
    sources["cdc-active-counts"] = failedStatus("CDC active multistate investigation counts", "https://www.cdc.gov/foodborne-outbreaks/outbreaks/", e, prevOutbreaks?.sources["cdc-active-counts"]);
  }

  const outbreaks: OutbreaksFile = {
    generatedAt,
    sources: { "cdc-outbreaks": sources["cdc-outbreaks"], "cdc-active-counts": sources["cdc-active-counts"] },
    activeInvestigationCounts: activeCounts,
    items: outbreakItems,
  };
  await writeJson("outbreaks.json", outbreaks);

  // --- Recalls: FDA + FSIS, independently ---
  const prevByAgency = (agency: Recall["agency"]) => (prevRecalls?.items ?? []).filter((r) => r.agency === agency);
  let fdaItems = prevByAgency("FDA");
  let fdaAll: Recall[] | null = null;
  try {
    const r = await fetchOpenFda({ log, since: signalStart });
    fdaAll = r.items;
    fdaItems = r.items.filter((x) => x.reportDate && x.reportDate >= isoDaysAgo(RECALLS_FDA_DAYS));
    sources["fda-openfda"] = r.source;
  } catch (e) {
    sources["fda-openfda"] = failedStatus("FDA food recalls (openFDA enforcement reports)", "https://api.fda.gov/food/enforcement.json", e, prevRecalls?.sources["fda-openfda"]);
  }
  let fsisItems = prevByAgency("FSIS");
  let fsisAll: Recall[] | null = null;
  try {
    const r = await fetchFsis({ log, since: signalStart });
    fsisAll = r.items;
    fsisItems = r.items.filter((x) => x.recallDate && x.recallDate >= isoDaysAgo(RECALLS_FSIS_DAYS));
    sources["fsis-recalls"] = r.source;
  } catch (e) {
    sources["fsis-recalls"] = failedStatus("USDA FSIS recalls", "https://www.fsis.usda.gov/recalls", e, prevRecalls?.sources["fsis-recalls"]);
  }
  const recallItems = [...fdaItems, ...fsisItems].sort((a, b) => (b.reportDate ?? "").localeCompare(a.reportDate ?? ""));
  const recalls: RecallsFile = {
    generatedAt,
    sources: { "fda-openfda": sources["fda-openfda"], "fsis-recalls": sources["fsis-recalls"] },
    items: recallItems,
  };
  await writeJson("recalls.json", recalls);

  // --- News: each feed independently; a failed feed keeps its previous items ---
  const prevNews = await readJson<NewsFile>("news.json");
  const newsResult = await fetchNews({ log });
  const newsItems = [];
  for (const feed of FEEDS) {
    const key = `news-${feed.key}`;
    if (newsResult.sources[key]?.ok) {
      newsItems.push(...(newsResult.byFeed[feed.key] ?? []));
      sources[key] = newsResult.sources[key];
    } else {
      const prevStatus = prevNews?.sources[key];
      sources[key] = { ...newsResult.sources[key], fetchedAt: prevStatus?.fetchedAt ?? null, itemCount: prevStatus?.itemCount ?? null };
      newsItems.push(...(prevNews?.items ?? []).filter((i) => i.feed === feed.key));
    }
  }
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const news: NewsFile = {
    generatedAt,
    sources: Object.fromEntries(Object.entries(sources).filter(([k]) => k.startsWith("news-"))),
    items: dedupe(newsItems).filter((i) => i.publishedAt >= cutoff),
  };
  await writeJson("news.json", news);

  // --- Signals: the classified dataset behind the Signal Explorer, plus its change log ---
  // Built from the wide fetches above. A source that failed keeps its previous signals unchanged.
  const prevSignals = await readJson<SignalsFile>("signals.json");
  const prevLog = await readJson<ChangeLogFile>("signals-changelog.json");
  const failedSources = new Set<"CDC" | "FDA" | "FSIS">();
  if (cdcAll === null) failedSources.add("CDC");
  if (fdaAll === null) failedSources.add("FDA");
  if (fsisAll === null) failedSources.add("FSIS");
  const { file: signals, log: changelog } = buildSignals({
    outbreaks: cdcAll ?? [],
    recalls: [...(fdaAll ?? []), ...(fsisAll ?? [])],
    carryOver: (prevSignals?.items ?? []).filter((s) => failedSources.has(s.source) || cdcCarryIds.has(s.id)),
    previous: prevSignals,
    previousLog: prevLog,
    sources: { "cdc-outbreaks": sources["cdc-outbreaks"], "fda-openfda": sources["fda-openfda"], "fsis-recalls": sources["fsis-recalls"] },
    now: generatedAt,
    windowStart: signalStart,
  });
  await writeJson("signals.json", signals);
  await writeJson("signals-changelog.json", changelog);
  const newEntries = changelog.entries.filter((e) => e.at === generatedAt);
  log(`signals: ${signals.items.length} records, ${newEntries.length} change log entr${newEntries.length === 1 ? "y" : "ies"} this run${failedSources.size ? ` (carried over: ${[...failedSources].join(", ")})` : ""}`);

  const status: StatusFile = { generatedAt, sources };
  await writeJson("status.json", status);

  const failed = Object.values(sources).filter((s) => !s.ok);
  log(`done: ${outbreakItems.length} outbreaks, ${recallItems.length} recalls, ${news.items.length} news items, ${signals.items.length} signals, ${failed.length} source failure(s)`);
  return status;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

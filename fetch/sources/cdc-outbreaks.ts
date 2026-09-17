// CDC multistate foodborne outbreak notices.
//
// The outbreaks page (https://www.cdc.gov/foodborne-outbreaks/outbreaks/) renders its table
// client-side from a CSV file, so we read the CSV directly. Each row links to an outbreak's
// index page, which carries a "Fast Facts" box (cases, hospitalizations, deaths, states),
// "Investigation status" and "Recall issued" lines, and Published/Updated dates.
// The investigation page has the illness onset range; the locations page points to a map
// config JSON with per-state case counts.

import * as cheerio from "cheerio";
import { parse as parseCsv } from "csv-parse/sync";
import { fetchText, fetchJson, mapLimit, HttpError } from "../lib/http.js";
import { parseLongDate } from "../lib/dates.js";
import { clean, firstInt } from "../lib/text.js";
import { toStateCode } from "../lib/states.js";
import { foodKeys } from "../foods.js";
import type { Outbreak, OutbreakStatus, PathogenFamily, SourceStatus, StateCount } from "../types.js";

export const CDC_BASE = "https://www.cdc.gov";
export const CDC_OUTBREAKS_PAGE = `${CDC_BASE}/foodborne-outbreaks/outbreaks/`;
export const CDC_LIST_CSV = `${CDC_BASE}/foodborne-outbreaks/media/files/2024/04/full-outbreak-list.csv`;
/** CDC removed most notices from before 2024 from www.cdc.gov; they live on in its archive at the same path. */
export const CDC_ARCHIVE_BASE = "https://archive.cdc.gov/www_cdc_gov";

export interface ListRow {
  path: string; // e.g. /salmonella/outbreaks/broccoli-sprouts-09-26/index.html
  food: string;
  pathogen: string;
  year: number | null;
}

/** Parse the CSV behind the CDC outbreak table. Cells contain HTML (a link and <em> tags). */
export function parseOutbreakList(csv: string): ListRow[] {
  const records = parseCsv(csv, { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true }) as Record<string, string>[];
  const rows: ListRow[] = [];
  for (const rec of records) {
    const foodCell = rec["Contaminated Food"] ?? "";
    const $ = cheerio.load(`<div>${foodCell}</div>`);
    const a = $("a").first();
    const path = a.attr("href")?.trim();
    if (!path) continue;
    const food = clean(a.text()) || clean($("div").text());
    const pathogen = clean(cheerio.load(`<div>${rec["Germ"] ?? ""}</div>`)("div").text());
    const yearMatch = (rec["Year"] ?? "").match(/\d{4}/);
    let year = yearMatch ? Number(yearMatch[0]) : null;
    if (year === null) {
      // Fall back to the -MM-YY suffix CDC uses in outbreak slugs.
      const slug = path.match(/-(\d{2})-(\d{2})\/(?:index\.html)?$/);
      if (slug) year = 2000 + Number(slug[2]);
    }
    rows.push({ path, food, pathogen, year });
  }
  return rows;
}

export function pathogenFamily(pathogen: string): PathogenFamily {
  const p = pathogen.toLowerCase();
  if (/salmonella/.test(p) && !/e\. ?coli|stec/.test(p)) return "Salmonella";
  if (/e\. ?coli|stec|shiga/.test(p)) return "E. coli";
  if (/listeria/.test(p)) return "Listeria";
  if (/campylobacter/.test(p)) return "Campylobacter";
  if (/cyclospora/.test(p)) return "Cyclospora";
  if (/botul|clostridium/.test(p)) return "Botulism";
  if (/hepatitis/.test(p)) return "Hepatitis A";
  if (/vibrio/.test(p)) return "Vibrio";
  if (/shigella/.test(p)) return "Shigella";
  if (/norovirus/.test(p)) return "Norovirus";
  return "Other";
}

export interface IndexPageData {
  title: string | null;
  status: OutbreakStatus;
  recallIssued: boolean | null;
  cases: number | null;
  hospitalizations: number | null;
  deaths: number | null;
  stateCount: number | null;
  postedAt: string | null;
  updatedAt: string | null;
  declaredOverAt: string | null;
  warnings: string[];
}

/** Collect "label: value" pairs from CDC's fact-top elements, keyed by lower-case label without colon. */
function factPairs($: cheerio.CheerioAPI): Record<string, string> {
  const pairs: Record<string, string> = {};
  $("div.fact-top").each((_, el) => {
    const label = clean($(el).find("span.label").first().text()).replace(/:$/, "").toLowerCase();
    const value = clean($(el).text()).replace(new RegExp(`^${label}\\s*:?`, "i"), "").trim();
    if (label) pairs[label] = value;
  });
  $("span.fact-top.label").each((_, el) => {
    const label = clean($(el).text()).replace(/:$/, "").toLowerCase();
    const value = clean($(el).parent().text()).replace(new RegExp(`^${label}\\s*:?`, "i"), "").trim();
    if (label) pairs[label] = value;
  });
  return pairs;
}

export function parseOutbreakIndex(html: string): IndexPageData {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const rawTitle = $('meta[property="og:title"]').attr("content") || $("title").text();
  const title = clean(rawTitle.split("|")[0]) || null;
  if (!title) warnings.push("title");

  const facts = factPairs($);
  const bodyText = clean($("main, #content").text() || $("body").text());
  // Notices from 2023 and earlier (now served from archive.cdc.gov) use an older template where the
  // Fast Facts box is one run of text: "Illnesses: 16 Hospitalizations: 7 Deaths: 0 States: 12 Recall: No Investigation status: Closed".
  if (Object.keys(facts).length === 0) {
    const box = $(".card").filter((_, el) => /fast facts/i.test($(el).text())).first();
    const t = clean(box.text() || (bodyText.match(/Fast Facts.{0,200}/i)?.[0] ?? ""));
    for (const [label, key] of [["illnesses", "cases"], ["cases", "cases"], ["hospitalizations", "hospitalizations"], ["deaths", "deaths"], ["states", "states"], ["recall", "recall issued"], ["investigation status", "investigation status"]] as const) {
      const m = t.match(new RegExp(`${label}:\\s*([A-Za-z0-9,]+)`, "i"));
      if (m && !(key in facts)) facts[key] = m[1];
    }
  }

  let status: OutbreakStatus = "unknown";
  const statusText = (facts["investigation status"] ?? "").toLowerCase();
  if (/^open|^active/.test(statusText)) status = "active";
  else if (/^closed|^over/.test(statusText)) status = "over";
  if (/this outbreak (is over|has ended)/i.test(bodyText)) status = "over";
  if (status === "unknown") warnings.push("status");

  const recallText = (facts["recall issued"] ?? "").toLowerCase();
  const recallIssued = recallText.startsWith("yes") ? true : recallText.startsWith("no") ? false : null;

  const num = (key: string) => {
    if (!(key in facts)) { warnings.push(key); return null; }
    return firstInt(facts[key]);
  };
  const cases = num("cases");
  const hospitalizations = num("hospitalizations");
  const deaths = num("deaths");
  const stateCount = num("states");

  // CDC puts publish/update dates in meta tags on every template; the visible
  // "About This Page" block only exists on newer pages, so it is the fallback.
  const updatedNode = $(".updated-date").first().clone();
  updatedNode.find("p").remove();
  const postedAt =
    parseLongDate($('meta[property="cdc:first_published"]').attr("content")) ??
    parseLongDate(clean($(".published-date").first().text()));
  const updatedAt =
    parseLongDate($('meta[property="cdc:last_updated"]').attr("content")) ??
    parseLongDate(clean(updatedNode.text())) ??
    parseLongDate(clean($("time.cdc-page-title-bar__item--date").first().text()));
  if (!postedAt) warnings.push("postedAt");

  const overMatch = bodyText.match(/As of ([A-Za-z]+\.? \d{1,2}, \d{4}),? (?:this outbreak (?:is over|has ended)|this is CDC.s final update)/i);
  const declaredOverAt = overMatch ? parseLongDate(overMatch[1]) : null;

  return { title, status, recallIssued, cases, hospitalizations, deaths, stateCount, postedAt, updatedAt, declaredOverAt, warnings };
}

export interface InvestigationPageData {
  illnessOnsetFrom: string | null;
  illnessOnsetTo: string | null;
  declaredOverAt: string | null;
  /** Backup figures from the prose, used only if the index page's fast facts are missing. */
  cases: number | null;
  stateCount: number | null;
}

export function parseInvestigationPage(html: string): InvestigationPageData {
  const $ = cheerio.load(html);
  const text = clean($("main, #content").text() || $("body").text());
  const onset = text.match(/Illnesses started on dates ranging from ([A-Za-z]+\.? \d{1,2}, \d{4}),? to ([A-Za-z]+\.? \d{1,2}, \d{4})/i);
  const over = text.match(/As of ([A-Za-z]+\.? \d{1,2}, \d{4}), this outbreak is over/i);
  const total = text.match(/A total of (\d[\d,]*) people .{0,80}? reported from (\d+) states?/i);
  return {
    illnessOnsetFrom: onset ? parseLongDate(onset[1]) : null,
    illnessOnsetTo: onset ? parseLongDate(onset[2]) : null,
    declaredOverAt: over ? parseLongDate(over[1]) : null,
    cases: total ? firstInt(total[1]) : null,
    stateCount: total ? Number(total[2]) : null,
  };
}

/** The locations page embeds a visualization whose config JSON holds the per-state data. */
export function parseLocationsPage(html: string): string | null {
  const $ = cheerio.load(html);
  const url = $("[data-config-url]").first().attr("data-config-url");
  return url ? url.trim() : null;
}

export function parseMapConfig(config: unknown): StateCount[] {
  const data = (config as { data?: Record<string, string>[] })?.data;
  if (!Array.isArray(data)) return [];
  const out: StateCount[] = [];
  for (const row of data) {
    const keys = Object.keys(row);
    const stateKey = keys.find((k) => /state/i.test(k));
    const countKey = keys.find((k) => /sick|case|ill|number|count/i.test(k) && k !== stateKey);
    if (!stateKey || !countKey) continue;
    const state = toStateCode(row[stateKey]);
    const cases = firstInt(row[countKey]);
    if (state && cases !== null) out.push({ state, cases });
  }
  return out.sort((a, b) => a.state.localeCompare(b.state));
}

export function outbreakId(path: string): string {
  return "cdc:" + path.replace(/^\//, "").replace(/\/index\.html$/, "").replace(/\/$/, "");
}

export interface FetchCdcOptions {
  /** Only fetch detail pages for outbreaks from this year onward. Older rows are skipped entirely. */
  minYear?: number;
  concurrency?: number;
  log?: (msg: string) => void;
}

export interface FetchCdcResult {
  items: Outbreak[];
  source: SourceStatus;
}

export async function fetchCdcOutbreaks(opts: FetchCdcOptions = {}): Promise<FetchCdcResult> {
  const now = new Date();
  const minYear = opts.minYear ?? now.getUTCFullYear() - 1;
  const log = opts.log ?? (() => {});
  const fetchedAt = now.toISOString();

  const csv = await fetchText(CDC_LIST_CSV, { accept: "text/csv,*/*" });
  const rows = parseOutbreakList(csv);
  if (rows.length === 0) throw new Error("CDC outbreak list CSV parsed to zero rows; the file format may have changed");
  const recent = rows.filter((r) => r.year !== null && r.year >= minYear);
  log(`CDC list: ${rows.length} rows, ${recent.length} from ${minYear} onward`);

  const items = await mapLimit(recent, opts.concurrency ?? 4, async (row): Promise<Outbreak> => {
    const url = CDC_BASE + row.path;
    // Modern notices live in a folder with index/investigation/locations pages. A few very old
    // notices are single flat pages with no sub-pages to fetch.
    let base = /\/index\.html$/.test(url) ? url.replace(/index\.html$/, "") : null;
    const warnings: string[] = [];
    let index: IndexPageData | null = null;
    let inv: InvestigationPageData | null = null;
    let states: StateCount[] = [];
    let pageUrl = url;

    // CDC has moved older notices twice: newer paths insert "/outbreaks/" after the germ, and
    // pages removed from www.cdc.gov survive at the same path on archive.cdc.gov. Try each in turn,
    // but only on 404; any other failure (such as bot protection) is reported as is.
    const candidates = [url];
    const moved = row.path.replace(/^\/(salmonella|listeria|ecoli|norovirus|hepatitis|campylobacter|cyclosporiasis|vibrio|botulism)\/(?!outbreaks\/)/, "/$1/outbreaks/");
    if (moved !== row.path) candidates.push(CDC_BASE + moved);
    candidates.push(CDC_ARCHIVE_BASE + row.path);
    if (moved !== row.path) candidates.push(CDC_ARCHIVE_BASE + moved);
    for (let i = 0; i < candidates.length; i++) {
      try {
        index = parseOutbreakIndex(await fetchText(candidates[i]));
        pageUrl = candidates[i];
        warnings.push(...index.warnings);
        if (pageUrl.startsWith(CDC_ARCHIVE_BASE)) {
          warnings.push("served from archive.cdc.gov");
          base = null; // archived notices are single pages; their sub-pages are not archived
        } else if (pageUrl !== url) {
          base = pageUrl.replace(/index\.html$/, "");
        }
        break;
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 0;
        if (status !== 404) {
          warnings.push(`index page: ${(e as Error).message}`);
          break;
        }
        if (i === candidates.length - 1) {
          // Gone everywhere. CDC's list still names the food, germ, and year, and the notice id
          // carries the month ("thompson-10-23" = October 2023), so keep a minimal record.
          warnings.push("notice removed from cdc.gov");
          pageUrl = CDC_OUTBREAKS_PAGE;
          base = null;
        }
      }
    }
    const slugDate = row.path.match(/-(\d{2})-(\d{2})\/(?:index\.html?)?$/);
    const approxPosted = slugDate && Number(slugDate[1]) >= 1 && Number(slugDate[1]) <= 12 ? `20${slugDate[2]}-${slugDate[1]}-01` : null;
    if (base) {
      try {
        inv = parseInvestigationPage(await fetchText(base + "investigation.html"));
      } catch (e) {
        warnings.push(`investigation page: ${(e as Error).message}`);
      }
      try {
        const configPath = parseLocationsPage(await fetchText(base + "locations.html"));
        if (configPath) states = parseMapConfig(await fetchJson(configPath.startsWith("http") ? configPath : CDC_BASE + configPath));
        else warnings.push("map config");
      } catch (e) {
        warnings.push(`locations page: ${(e as Error).message}`);
      }
    }

    const cases = index?.cases ?? inv?.cases ?? null;
    const stateCount = index?.stateCount ?? inv?.stateCount ?? (states.length || null);
    log(`  ${row.food} (${row.pathogen}): ${index?.status ?? "?"}, cases=${cases}${warnings.length ? " warnings=" + warnings.join(",") : ""}`);
    return {
      id: outbreakId(row.path),
      agency: "CDC",
      url: pageUrl,
      title: index?.title ?? `${row.pathogen} outbreak linked to ${row.food}`,
      food: row.food,
      foodKeys: foodKeys(row.food),
      pathogen: row.pathogen,
      pathogenFamily: pathogenFamily(row.pathogen),
      status: index?.status ?? "unknown",
      cases,
      hospitalizations: index?.hospitalizations ?? null,
      deaths: index?.deaths ?? null,
      stateCount,
      states,
      illnessOnsetFrom: inv?.illnessOnsetFrom ?? null,
      illnessOnsetTo: inv?.illnessOnsetTo ?? null,
      postedAt: index?.postedAt ?? (warnings.includes("notice removed from cdc.gov") ? approxPosted : null),
      updatedAt: index?.updatedAt ?? null,
      declaredOverAt: index?.declaredOverAt ?? inv?.declaredOverAt ?? null,
      recallIssued: index?.recallIssued ?? null,
      year: row.year,
      fetchedAt,
      parseWarnings: warnings,
    };
  });

  items.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "") || (b.year ?? 0) - (a.year ?? 0));
  return {
    items,
    source: {
      name: "CDC multistate foodborne outbreak notices",
      url: CDC_OUTBREAKS_PAGE,
      fetchedAt,
      ok: true,
      error: null,
      upstreamUpdated: null,
      itemCount: items.length,
    },
  };
}

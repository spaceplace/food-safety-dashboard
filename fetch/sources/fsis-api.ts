// USDA FSIS recalls (meat, poultry, egg products).
// Primary: the FSIS recall API, which returns the complete recall history as one JSON array.
// https://www.fsis.usda.gov/science-data/developer-resources/recall-api
// Fallback: the FSIS recalls RSS feed, which only gives title, link, and date.

import * as cheerio from "cheerio";
import { fetchJson, fetchText } from "../lib/http.js";
import { daysAgo, parseIsoDate, toIsoDay } from "../lib/dates.js";
import { clean, stripHtml, truncate } from "../lib/text.js";
import { toStateCode } from "../lib/states.js";
import { foodKeys } from "../foods.js";
import type { Recall, SourceStatus } from "../types.js";
import { classification, reasonCategory, recallCategory } from "./recall-classify.js";

export const FSIS_API_URL = "https://www.fsis.usda.gov/fsis/api/recall/v/1";
export const FSIS_RSS_URL = "https://www.fsis.usda.gov/fsis-content/rss/recalls.xml";
export const FSIS_RECALLS_PAGE = "https://www.fsis.usda.gov/recalls";

export interface FsisRecord {
  field_title: string;
  field_recall_number: string;
  field_recall_url: string;
  field_active_notice: string;
  field_states: string[];
  field_risk_level: string;
  field_recall_classification: string;
  field_recall_date: string;
  field_last_modified_date: string;
  field_recall_reason: string[];
  field_recall_type: string;
  field_related_to_outbreak: string;
  field_summary: string;
  field_product_items: string[];
  field_establishment?: string[];
  field_closed_year?: string;
  field_processing?: string[];
}

function firmFromTitle(title: string): string {
  // FSIS titles read "Acme Foods Inc. Recalls Ground Beef Products Due to ...".
  // Public health alerts read "FSIS Issues Public Health Alert for ..." and name no firm.
  if (/^FSIS\b/i.test(title)) return "";
  const m = title.match(/^(.+?)\s+(Recalls?|Issues|Announces|Expands)\b/i);
  return clean(m ? m[1] : title);
}

export function mapFsisRecords(records: FsisRecord[], fetchedAt: string, sinceIso: string): Recall[] {
  const out: Recall[] = [];
  for (const r of records) {
    const recallDate = parseIsoDate(r.field_recall_date);
    if (!recallDate || recallDate < sinceIso) continue;
    const title = stripHtml(r.field_title);
    const products = (r.field_product_items ?? []).map((p) => stripHtml(p).replace(/^•\s*/, "")).filter(Boolean);
    const summary = stripHtml(r.field_summary);
    const reason = (r.field_recall_reason ?? []).map(clean).filter(Boolean).join("; ");
    const reasonText = `${reason} ${title} ${summary.slice(0, 400)}`;
    const url = (r.field_recall_url || "").replace(/^http:\/\//, "https://") || FSIS_RECALLS_PAGE;
    out.push({
      id: `fsis:${r.field_recall_number || url}`,
      agency: "FSIS",
      url,
      sourceRecordUrl: FSIS_API_URL,
      title,
      firm: firmFromTitle(title) || stripHtml((r.field_establishment ?? [])[0] ?? "") || "Not named (public health alert)",
      product: truncate(products[0] ?? summary, 200),
      products,
      productCount: products.length,
      category: recallCategory(`${title} ${products.join(" ")}`),
      foodKeys: foodKeys(`${title} ${products.join(" ")}`),
      reason: reason || clean(r.field_recall_type),
      reasonCategory: reasonCategory(reasonText),
      classification: classification(r.field_recall_classification || r.field_risk_level),
      status: clean(r.field_recall_type) || (r.field_active_notice === "True" ? "Active" : "Closed"),
      states: (r.field_states ?? []).map(toStateCode).filter((s): s is string => !!s),
      distributionPattern: null,
      relatedToOutbreak: r.field_related_to_outbreak === "True" ? true : r.field_related_to_outbreak === "False" ? false : null,
      recallDate,
      reportDate: recallDate,
      initiatedBy: null,
      notificationMethod: null,
      summary: truncate(summary, 2000) || null,
      closedDate: null,
      closedYear: clean(r.field_closed_year) || null,
      agencyUpdatedAt: parseIsoDate(r.field_last_modified_date),
      processing: (r.field_processing ?? []).map(clean).filter(Boolean),
      firmLocation: null,
      fetchedAt,
    });
  }
  out.sort((a, b) => (b.recallDate ?? "").localeCompare(a.recallDate ?? ""));
  return out;
}

/** RSS fallback: far less detail, but keeps the site current if the API is blocked. */
export function parseFsisRss(xml: string, fetchedAt: string, sinceIso: string): Recall[] {
  const $ = cheerio.load(xml, { xml: true });
  const out: Recall[] = [];
  $("item").each((_, el) => {
    const title = clean($(el).find("title").text());
    const url = clean($(el).find("link").text()).replace(/^http:\/\//, "https://");
    const pub = new Date(clean($(el).find("pubDate").text()));
    const recallDate = isNaN(pub.getTime()) ? null : toIsoDay(pub);
    if (!recallDate || recallDate < sinceIso) return;
    const summary = stripHtml($(el).find("description").text());
    out.push({
      id: `fsis:${url}`,
      agency: "FSIS",
      url,
      sourceRecordUrl: null,
      title,
      firm: firmFromTitle(title),
      product: truncate(summary, 200),
      products: [],
      productCount: 0,
      category: recallCategory(title),
      foodKeys: foodKeys(title),
      reason: "",
      reasonCategory: reasonCategory(`${title} ${summary}`),
      classification: null,
      status: "unknown",
      states: null,
      distributionPattern: null,
      relatedToOutbreak: null,
      recallDate,
      reportDate: recallDate,
      initiatedBy: null,
      notificationMethod: null,
      summary: summary || null,
      closedDate: null,
      closedYear: null,
      agencyUpdatedAt: null,
      processing: null,
      firmLocation: null,
      fetchedAt,
    });
  });
  return out;
}

export interface FetchFsisOptions {
  days?: number;
  log?: (msg: string) => void;
}

export async function fetchFsis(opts: FetchFsisOptions = {}): Promise<{ items: Recall[]; source: SourceStatus }> {
  const fetchedAt = new Date().toISOString();
  const log = opts.log ?? (() => {});
  const since = toIsoDay(daysAgo(opts.days ?? 365));
  try {
    const records = await fetchJson<FsisRecord[]>(FSIS_API_URL, { timeoutMs: 90_000 });
    if (!Array.isArray(records) || records.length === 0) throw new Error("FSIS API returned no records");
    const items = mapFsisRecords(records, fetchedAt, since);
    const newest = records.map((r) => r.field_last_modified_date).filter(Boolean).sort().at(-1) ?? null;
    log(`FSIS API: ${records.length} records total, ${items.length} since ${since}`);
    return {
      items,
      source: { name: "USDA FSIS recalls (recall API)", url: FSIS_API_URL, fetchedAt, ok: true, error: null, upstreamUpdated: newest, itemCount: items.length },
    };
  } catch (apiErr) {
    log(`FSIS API failed (${(apiErr as Error).message}); trying RSS`);
    const xml = await fetchText(FSIS_RSS_URL, { accept: "application/rss+xml,application/xml,*/*" });
    const items = parseFsisRss(xml, fetchedAt, since);
    if (items.length === 0) throw new Error(`FSIS API failed (${(apiErr as Error).message}) and RSS parsed to zero items`);
    return {
      items,
      source: { name: "USDA FSIS recalls (RSS fallback; API unavailable)", url: FSIS_RSS_URL, fetchedAt, ok: true, error: `API fallback: ${(apiErr as Error).message}`, upstreamUpdated: null, itemCount: items.length },
    };
  }
}

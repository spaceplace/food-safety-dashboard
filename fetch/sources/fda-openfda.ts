// FDA food recalls from the openFDA enforcement API.
// https://open.fda.gov/apis/food/enforcement/
// One API record per product; a single recall "event" can have dozens. We group by event_id
// so the site shows one row per recall. openFDA updates weekly and reports its own last_updated.

import { fetchJson } from "../lib/http.js";
import { compactDate, daysAgo, parseCompactDate } from "../lib/dates.js";
import { clean, truncate } from "../lib/text.js";
import { foodKeys } from "../foods.js";
import type { Recall, SourceStatus } from "../types.js";
import { classification, reasonCategory, recallCategory } from "./recall-classify.js";

export const OPENFDA_URL = "https://api.fda.gov/food/enforcement.json";
export const FDA_RECALLS_PAGE = "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts";

export interface OpenFdaRecord {
  event_id: string;
  recall_number: string;
  recalling_firm: string;
  product_description: string;
  reason_for_recall: string;
  classification: string;
  status: string;
  distribution_pattern: string;
  recall_initiation_date: string;
  report_date: string;
  product_type: string;
  city?: string;
  state?: string;
  voluntary_mandated?: string;
  initial_firm_notification?: string;
  center_classification_date?: string;
  termination_date?: string;
}

export interface OpenFdaResponse {
  meta: { last_updated: string; results: { skip: number; limit: number; total: number } };
  results: OpenFdaRecord[];
}

/** Group product records into one recall per event and map to our schema. Drops dietary supplements. */
export function mapOpenFdaRecords(records: OpenFdaRecord[], fetchedAt: string): { recalls: Recall[]; excludedSupplements: number } {
  const byEvent = new Map<string, OpenFdaRecord[]>();
  for (const r of records) {
    const key = r.event_id || r.recall_number;
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key)!.push(r);
  }
  const recalls: Recall[] = [];
  let excludedSupplements = 0;
  for (const [eventId, recs] of byEvent) {
    // Most recently reported record represents the event.
    recs.sort((a, b) => (b.report_date ?? "").localeCompare(a.report_date ?? ""));
    const head = recs[0];
    const products = recs.map((r) => clean(r.product_description)).filter(Boolean);
    const categories = recs.map((r) => recallCategory(r.product_description));
    // If every product is a supplement, drop the event. Mixed events stay, labeled by the majority.
    if (categories.every((c) => c === "dietary-supplement")) { excludedSupplements++; continue; }
    const category = categories.includes("pet-food") && !categories.includes("human-food") ? "pet-food" : "human-food";
    const firm = clean(head.recalling_firm);
    const product = truncate(products[0] ?? "", 200);
    recalls.push({
      id: `fda:${eventId}`,
      agency: "FDA",
      // openFDA has no per-recall web page. Link people to FDA's recall list filtered by the firm,
      // and keep the exact API record as the machine-readable source.
      url: `${FDA_RECALLS_PAGE}?search_api_views_fulltext=${encodeURIComponent(firm)}`,
      sourceRecordUrl: `${OPENFDA_URL}?search=event_id:${encodeURIComponent(eventId)}`,
      title: `${firm} recalls ${truncate(products[0] ?? "product", 90)}`,
      firm,
      product,
      products,
      productCount: products.length,
      category,
      // Product descriptions only: the reason text says things like "undeclared milk", which is not a dairy recall.
      foodKeys: foodKeys(products.join(" ")),
      reason: clean(head.reason_for_recall),
      reasonCategory: reasonCategory(head.reason_for_recall),
      classification: classification(head.classification),
      status: clean(head.status),
      states: null,
      distributionPattern: clean(head.distribution_pattern) || null,
      relatedToOutbreak: null,
      recallDate: parseCompactDate(head.recall_initiation_date),
      reportDate: parseCompactDate(head.report_date),
      initiatedBy: clean(head.voluntary_mandated) || null,
      notificationMethod: clean(head.initial_firm_notification) || null,
      summary: null,
      closedDate: parseCompactDate(head.termination_date),
      closedYear: parseCompactDate(head.termination_date)?.slice(0, 4) ?? null,
      agencyUpdatedAt: parseCompactDate(head.center_classification_date),
      processing: null,
      firmLocation: [clean(head.city), clean(head.state)].filter(Boolean).join(", ") || null,
      fetchedAt,
    });
  }
  recalls.sort((a, b) => (b.reportDate ?? "").localeCompare(a.reportDate ?? ""));
  return { recalls, excludedSupplements };
}

export interface FetchOpenFdaOptions {
  days?: number;
  log?: (msg: string) => void;
}

export async function fetchOpenFda(opts: FetchOpenFdaOptions = {}): Promise<{ items: Recall[]; source: SourceStatus }> {
  const fetchedAt = new Date().toISOString();
  const days = opts.days ?? 120;
  const log = opts.log ?? (() => {});
  const from = compactDate(daysAgo(days));
  const to = compactDate(daysAgo(-1)); // tomorrow, to be safe about time zones
  const search = `product_type:"Food"+AND+report_date:[${from}+TO+${to}]`;
  const limit = 1000;
  const records: OpenFdaRecord[] = [];
  let lastUpdated: string | null = null;
  let total = Infinity;
  // openFDA allows skip up to 25,000; three years of food records is about 5,000.
  for (let skip = 0; skip < total && skip < 25_000; skip += limit) {
    const url = `${OPENFDA_URL}?search=${search}&limit=${limit}&skip=${skip}`;
    const res = await fetchJson<OpenFdaResponse>(url);
    lastUpdated = res.meta?.last_updated ?? lastUpdated;
    total = res.meta?.results?.total ?? 0;
    records.push(...(res.results ?? []));
    if ((res.results ?? []).length < limit) break;
  }
  const { recalls, excludedSupplements } = mapOpenFdaRecords(records, fetchedAt);
  log(`openFDA: ${records.length} product records -> ${recalls.length} recall events (${excludedSupplements} supplement-only events dropped), last_updated ${lastUpdated}`);
  return {
    items: recalls,
    source: {
      name: "FDA food recalls (openFDA enforcement reports)",
      url: OPENFDA_URL,
      fetchedAt,
      ok: true,
      error: null,
      upstreamUpdated: lastUpdated,
      itemCount: recalls.length,
    },
  };
}

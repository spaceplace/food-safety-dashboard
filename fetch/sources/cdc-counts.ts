// The CDC outbreaks page shows how many multistate investigations CDC is actively working,
// by germ, with a "Last updated" date. That block is server-rendered, so we parse the text.

import * as cheerio from "cheerio";
import { fetchText } from "../lib/http.js";
import { parseUsDate } from "../lib/dates.js";
import { clean } from "../lib/text.js";
import type { ActiveInvestigationCounts, SourceStatus } from "../types.js";
import { CDC_OUTBREAKS_PAGE } from "./cdc-outbreaks.js";

const GERMS = ["Campylobacter", "E. coli", "Listeria", "Salmonella"];

export function parseActiveCounts(html: string): ActiveInvestigationCounts {
  const $ = cheerio.load(html);
  const text = clean($("main, #content").text() || $("body").text());
  const section = text.slice(text.indexOf("Active investigations by germ"));
  const counts: Record<string, number> = {};
  for (const germ of GERMS) {
    const re = new RegExp(germ.replace(".", "\\.") + "\\s*:\\s*(\\d+)");
    const m = section.match(re);
    if (m) counts[germ] = Number(m[1]);
  }
  const asOf = parseUsDate(section.match(/Last updated:\s*(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (Object.keys(counts).length === 0) throw new Error("CDC active investigation counts not found on page");
  return { asOf, counts, total };
}

export async function fetchCdcCounts(): Promise<{ counts: ActiveInvestigationCounts; source: SourceStatus }> {
  const fetchedAt = new Date().toISOString();
  const html = await fetchText(CDC_OUTBREAKS_PAGE);
  const counts = parseActiveCounts(html);
  return {
    counts,
    source: {
      name: "CDC active multistate investigation counts",
      url: CDC_OUTBREAKS_PAGE,
      fetchedAt,
      ok: true,
      error: null,
      upstreamUpdated: counts.asOf,
      itemCount: Object.keys(counts.counts).length,
    },
  };
}

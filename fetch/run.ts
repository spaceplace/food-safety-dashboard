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
import type { OutbreaksFile, Recall, RecallsFile, SourceStatus, StatusFile } from "./types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "data");

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

  // --- CDC outbreaks ---
  let outbreakItems = prevOutbreaks?.items ?? [];
  try {
    const r = await fetchCdcOutbreaks({ log });
    outbreakItems = r.items;
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
  try {
    const r = await fetchOpenFda({ log });
    fdaItems = r.items;
    sources["fda-openfda"] = r.source;
  } catch (e) {
    sources["fda-openfda"] = failedStatus("FDA food recalls (openFDA enforcement reports)", "https://api.fda.gov/food/enforcement.json", e, prevRecalls?.sources["fda-openfda"]);
  }
  let fsisItems = prevByAgency("FSIS");
  try {
    const r = await fetchFsis({ log });
    fsisItems = r.items;
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

  const status: StatusFile = { generatedAt, sources };
  await writeJson("status.json", status);

  const failed = Object.values(sources).filter((s) => !s.ok);
  log(`done: ${outbreakItems.length} outbreaks, ${recallItems.length} recalls, ${failed.length} source failure(s)`);
  return status;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

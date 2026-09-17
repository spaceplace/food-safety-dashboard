// Reads data/signals.json and data/signals-changelog.json and derives what the Signal Explorer
// pages show. Everything here runs at build time. The explorer page's browser script does the
// same aggregations (from signal-aggregate.ts) over the compact JSON at /signals/data.json.

import signalsJson from "../../../data/signals.json";
import changelogJson from "../../../data/signals-changelog.json";
import type { ChangeLogEntry, ChangeLogFile, Signal, SignalsFile } from "../../../fetch/types";
import { countBy, type CompactSignal } from "./signal-aggregate";

export * from "./signal-aggregate";

export const signalsFile = signalsJson as unknown as SignalsFile;
export const changelogFile = changelogJson as unknown as ChangeLogFile;
export const signals: Signal[] = signalsFile.items;

export function compact(s: Signal): CompactSignal {
  return {
    slug: s.slug,
    kind: s.kind,
    source: s.source,
    title: s.title.length > 140 ? s.title.slice(0, 139) + "…" : s.title,
    firm: s.firm,
    product: s.product.length > 120 ? s.product.slice(0, 119) + "…" : s.product,
    pc: s.productCategory,
    hz: s.hazardType,
    ag: s.agents.map((a) => a.name),
    cls: s.classification,
    geo: s.geography.scope,
    st: s.geography.states,
    rc: s.rootCause.category,
    det: s.detection.category,
    ca: s.correctiveAction.category,
    status: s.status.normalized,
    date: s.dates.reported ?? s.dates.event,
    cases: s.outbreak?.cases ?? null,
    foods: s.foodKeys,
  };
}

export const compactSignals: CompactSignal[] = signals.map(compact);

// ---------- Data quality (for the methodology page) ----------

export interface QualityRow {
  field: string;
  label: string;
  stated: number;
  inferred: number;
  missing: number;
}

export function dataQuality(items: Signal[]): QualityRow[] {
  const defs: Array<[string, string, (s: Signal) => "stated" | "inferred" | "missing"]> = [
    ["hazardType", "Hazard type", (s) => (s.hazardType === "undetermined" ? "missing" : s.kind === "outbreak" ? "stated" : "inferred")],
    ["agents", "Organism or allergen", (s) => (s.agents.length === 0 ? "missing" : s.kind === "outbreak" ? "stated" : "inferred")],
    ["productCategory", "Product category", (s) => (s.productCategory === "other" ? "missing" : "inferred")],
    ["geography", "Geography", (s) => (s.geography.scope === "unspecified" ? "missing" : s.inferred.includes("geography") ? "inferred" : "stated")],
    ["rootCause", "Root cause", (s) => (s.rootCause.basis === "not-stated" ? "missing" : s.rootCause.basis === "inferred" ? "inferred" : "stated")],
    ["detection", "Detection", (s) => (s.detection.basis === "not-stated" ? "missing" : s.detection.basis === "inferred" ? "inferred" : "stated")],
    ["correctiveAction", "Corrective action", (s) => (s.correctiveAction.category === "unknown" || s.correctiveAction.category === "investigation" ? "missing" : "stated")],
    ["status", "Status", (s) => (s.status.normalized === "unknown" ? "missing" : "stated")],
    ["classification", "Class", (s) => (s.kind === "outbreak" ? "stated" : s.classification ? "stated" : "missing")],
    ["closedDate", "Closed date", (s) => (s.status.normalized !== "closed" ? "stated" : s.dates.closed ? "stated" : "missing")],
  ];
  return defs.map(([field, label, f]) => {
    const row: QualityRow = { field, label, stated: 0, inferred: 0, missing: 0 };
    for (const s of items) row[f(s)]++;
    return row;
  });
}

/** Top hazard among records reported in the last 12 months, for the explorer's headline. */
export function topHazard(items: Signal[], sinceIso: string): [string, number] | null {
  return countBy(items.filter((s) => (s.dates.reported ?? "") >= sinceIso), (s) => s.hazardType)[0] ?? null;
}

// ---------- Lookups ----------

const entriesById = new Map<string, ChangeLogEntry[]>();
for (const e of changelogFile.entries) {
  if (!e.id) continue;
  if (!entriesById.has(e.id)) entriesById.set(e.id, []);
  entriesById.get(e.id)!.push(e);
}
export const historyFor = (id: string): ChangeLogEntry[] => entriesById.get(id) ?? [];

const byFirm = new Map<string, Signal[]>();
for (const s of signals) {
  if (!s.firm) continue;
  const k = s.firm.toLowerCase();
  if (!byFirm.has(k)) byFirm.set(k, []);
  byFirm.get(k)!.push(s);
}
export const sameFirm = (s: Signal): Signal[] => (s.firm ? (byFirm.get(s.firm.toLowerCase()) ?? []).filter((o) => o.id !== s.id) : []);

export const changeLabel: Record<ChangeLogEntry["change"], string> = {
  "initial-load": "Initial load",
  backfill: "Backfilled history",
  added: "Added",
  updated: "Updated",
  closed: "Closed",
  reopened: "Reopened",
  removed: "Removed by source",
};

export const statusClass = (s: Signal["status"]["normalized"]) => (s === "open" ? "open" : s === "closed" ? "over" : "unknown");

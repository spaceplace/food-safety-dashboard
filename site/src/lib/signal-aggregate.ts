// Pure aggregations over signal records, shared by the build (site/src/lib/signals.ts) and the
// explorer's browser script. Nothing here may import data files: the browser bundle must stay small.

import type { HazardType } from "../../../fetch/types";
import { HAZARD_TYPES } from "../../../fetch/signals/taxonomy";

export function countBy<T>(items: T[], key: (item: T) => string | string[] | null): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    for (const kk of Array.isArray(k) ? k : [k]) {
      if (kk === null) continue;
      m.set(kk, (m.get(kk) ?? 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** The last `n` calendar months ending with the month of `end`, as "YYYY-MM". */
export function monthKeys(n: number, end: Date = new Date()): string[] {
  const out: string[] = [];
  let y = end.getUTCFullYear();
  let m = end.getUTCMonth();
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m + 1).padStart(2, "0")}`);
    m--;
    if (m < 0) { m = 11; y--; }
  }
  return out;
}

export const HAZARD_ORDER: HazardType[] = HAZARD_TYPES.map((t) => t.key);
/** Which chart color slot each hazard type uses. Fixed, so a filter never repaints the survivors. */
export const HAZARD_SLOTS: Record<string, number> = Object.fromEntries(HAZARD_ORDER.map((k, i) => [k, i + 1]));

export interface MonthlySeries {
  months: string[];
  series: Array<{ key: string; label: string; values: number[] }>;
}

/** Records per month, stacked by hazard type. Records with no date are left out. */
export function monthlyByHazard(items: Array<{ date: string | null; hz: HazardType }>, months: string[]): MonthlySeries {
  const index = new Map(months.map((m, i) => [m, i]));
  const series = HAZARD_ORDER.map((key) => ({ key, label: HAZARD_TYPES.find((t) => t.key === key)!.label, values: months.map(() => 0) }));
  const byKey = new Map(series.map((s) => [s.key, s]));
  for (const it of items) {
    if (!it.date) continue;
    const i = index.get(it.date.slice(0, 7));
    if (i === undefined) continue;
    byKey.get(it.hz)!.values[i]++;
  }
  return { months, series: series.filter((s) => s.values.some((v) => v > 0)) };
}

/** The compact record shape shipped to the browser as /signals/data.json. */
export interface CompactSignal {
  slug: string;
  kind: "recall" | "public-health-alert" | "outbreak";
  source: "CDC" | "FDA" | "FSIS";
  title: string;
  firm: string | null;
  product: string;
  pc: string;
  hz: HazardType;
  ag: string[];
  cls: string | null;
  geo: string;
  st: string[];
  rc: string;
  det: string;
  ca: string;
  status: "open" | "closed" | "unknown";
  date: string | null;
  cases: number | null;
  foods: string[];
}

const DAY = 86_400_000;
export const isoDaysAgo = (days: number, now = Date.now()) => new Date(now - days * DAY).toISOString().slice(0, 10);

export function compactMetrics(items: CompactSignal[], now = Date.now()) {
  const d30 = isoDaysAgo(30, now);
  const d60 = isoDaysAgo(60, now);
  const d365 = isoDaysAgo(365, now);
  const dated = (s: CompactSignal) => s.date ?? "";
  const last12 = items.filter((s) => dated(s) >= d365);
  return {
    total: items.length,
    open: items.filter((s) => s.status === "open").length,
    last30: items.filter((s) => dated(s) >= d30).length,
    prior30: items.filter((s) => dated(s) >= d60 && dated(s) < d30).length,
    classI12: last12.filter((s) => s.cls === "Class I").length,
    outbreaks12: last12.filter((s) => s.kind === "outbreak").length,
    illnesses12: last12.reduce((a, s) => a + (s.cases ?? 0), 0),
  };
}

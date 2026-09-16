const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "September 9, 2026", "Sept. 11, 2026", "Feb 24 2026" -> "2026-09-09". Null if not a date. */
export function parseLongDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return isoDate(Number(m[3]), month, Number(m[2]));
}

/** "9/16/2026" -> "2026-09-16". */
export function parseUsDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return isoDate(Number(m[3]), Number(m[1]), Number(m[2]));
}

/** openFDA style "20260909" -> "2026-09-09". */
export function parseCompactDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Already ISO-ish "2026-09-09" or "2026-09-09T..." -> "2026-09-09". */
export function parseIsoDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function compactDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

export function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * 86_400_000);
}

export function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

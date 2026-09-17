// Chart rendering shared by the build (server-rendered first paint) and the browser (re-render on
// filter). Pure string output, no DOM, so it works in both places. Colors come from CSS variables
// --viz-1..--viz-8 defined in global.css, assigned in a fixed order and never cycled.

export interface Series {
  key: string;
  label: string;
  values: number[];
}

export interface TrendOptions {
  width?: number;
  height?: number;
  /** Which --viz-N slot each series key uses. Keys not listed get slot 8. */
  slots: Record<string, number>;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function monthLabel(key: string, short = false): string {
  const [y, m] = key.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return short ? name : `${name} ${y}`;
}

/** Round the axis top up to a friendly number. */
function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Stacked monthly columns. Segments carry data attributes so the page can show a tooltip. */
export function renderTrendSvg(months: string[], series: Series[], opts: TrendOptions): string {
  const width = opts.width ?? 900;
  const height = opts.height ?? 260;
  const pad = { top: 12, right: 8, bottom: 28, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const totals = months.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
  const max = niceMax(Math.max(1, ...totals));
  const slotW = plotW / Math.max(1, months.length);
  const barW = Math.max(3, Math.min(28, slotW - 2));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;

  const ticks = 4;
  let grid = "";
  for (let t = 0; t <= ticks; t++) {
    const v = (max / ticks) * t;
    const yy = y(v);
    grid += `<line x1="${pad.left}" x2="${width - pad.right}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    grid += `<text x="${pad.left - 6}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`;
  }

  let bars = "";
  let hits = "";
  months.forEach((mo, i) => {
    const x = pad.left + i * slotW + (slotW - barW) / 2;
    let acc = 0;
    for (const s of series) {
      const v = s.values[i];
      if (v <= 0) continue;
      const top = y(acc + v);
      const h = y(acc) - top;
      const slot = opts.slots[s.key] ?? 8;
      bars += `<rect class="seg" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" rx="${h > 6 ? 2 : 0}" fill="var(--viz-${slot})"/>`;
      acc += v;
    }
    const rows = series.filter((s) => s.values[i] > 0).map((s) => `${s.label}=${s.values[i]}`).join("|");
    hits += `<rect class="hit" x="${(pad.left + i * slotW).toFixed(1)}" y="${pad.top}" width="${slotW.toFixed(1)}" height="${plotH}" data-month="${esc(monthLabel(mo))}" data-total="${totals[i]}" data-rows="${esc(rows)}"><title>${esc(monthLabel(mo))}: ${totals[i]}</title></rect>`;
  });

  // Label every January and July for short spans, only January for long ones, so labels never collide.
  const everyJuly = months.length <= 48;
  let labels = "";
  months.forEach((mo, i) => {
    const m = Number(mo.slice(5));
    const showYear = m === 1 || i === 0;
    if (m === 1 || (everyJuly && m === 7) || i === 0) {
      const x = pad.left + i * slotW + slotW / 2;
      labels += `<text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle">${showYear ? esc(monthLabel(mo)) : monthLabel(mo, true)}</text>`;
    }
  });

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Records per month, stacked by hazard type" preserveAspectRatio="xMidYMid meet">
<g class="grid">${grid}</g>
<line class="baseline" x1="${pad.left}" x2="${width - pad.right}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
<g class="bars">${bars}</g>
<g class="axis">${labels}</g>
<g class="hits">${hits}</g>
</svg>`;
}

export interface RankRow {
  key: string;
  label: string;
  count: number;
  /** Query-string fragment applied when the row is clicked, e.g. "hazard=allergen". */
  filter?: string;
}

/** A ranked list of horizontal bars, all in one hue because they encode magnitude, not identity. */
export function renderRankHtml(rows: RankRow[], total: number, hrefBase?: string): string {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return `<ol class="bars">${rows
    .map((r) => {
      const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
      const name = r.filter && hrefBase !== undefined ? `<a href="${esc(hrefBase)}?${esc(r.filter)}" data-filter="${esc(r.filter)}">${esc(r.label)}</a>` : esc(r.label);
      return `<li><span class="name" title="${esc(r.label)}">${name}</span><span class="track"><span class="fill" style="width:${((r.count / max) * 100).toFixed(1)}%"></span></span><span class="n" title="${pct}% of shown records">${r.count}</span></li>`;
    })
    .join("")}</ol>`;
}

export function renderLegendHtml(series: Series[], slots: Record<string, number>): string {
  return `<ul class="legend">${series.map((s) => `<li><span class="swatch" style="background:var(--viz-${slots[s.key] ?? 8})"></span>${esc(s.label)}</li>`).join("")}</ul>`;
}

export function renderMonthTableHtml(months: string[], series: Series[]): string {
  const head = `<tr><th scope="col">Month</th>${series.map((s) => `<th scope="col" class="num">${esc(s.label)}</th>`).join("")}<th scope="col" class="num">Total</th></tr>`;
  const body = months
    .map((mo, i) => {
      const total = series.reduce((a, s) => a + s.values[i], 0);
      return `<tr><td>${esc(monthLabel(mo))}</td>${series.map((s) => `<td class="num">${s.values[i]}</td>`).join("")}<td class="num">${total}</td></tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

export interface PieOptions {
  /** Fixed color slot per key (identity colors, e.g. hazard types). Keys not listed take the next free slot by rank. */
  slots?: Record<string, number>;
  /** Slices beyond this many are folded into "Other". */
  maxSlices?: number;
  /** Label for the ring's center. */
  centerLabel?: string;
}

/**
 * A donut chart. Slices are links carrying data-filter so a click filters the explorer; every
 * slice is also listed in the legend with its count, so identity never depends on color alone.
 */
export function renderPieHtml(rows: RankRow[], total: number, hrefBase: string, opts: PieOptions = {}): string {
  const maxSlices = opts.maxSlices ?? 7;
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, maxSlices);
  const tail = sorted.slice(maxSlices);
  const slices: RankRow[] = tail.length > 0 ? [...head, { key: "__other", label: `Other (${tail.length})`, count: tail.reduce((a, r) => a + r.count, 0) }] : head;
  const sum = slices.reduce((a, r) => a + r.count, 0);
  if (sum === 0) return `<p class="small muted">Nothing to chart.</p>`;

  const cx = 100, cy = 100, r = 88, inner = 52;
  const used = new Set(Object.values(opts.slots ?? {}).filter((n) => slices.some((s) => (opts.slots ?? {})[s.key] === n)));
  let nextSlot = 1;
  const slotFor = (key: string) => {
    const fixed = opts.slots?.[key];
    if (fixed) return fixed;
    while (used.has(nextSlot) && nextSlot < 8) nextSlot++;
    const s = Math.min(nextSlot, 8);
    used.add(s);
    return s;
  };
  const point = (angle: number, radius: number) => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  let angle = -Math.PI / 2;
  let paths = "";
  let labels = "";
  const legend: string[] = [];
  for (const s of slices) {
    const frac = s.count / sum;
    const sweep = frac * 2 * Math.PI;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const slot = slotFor(s.key);
    const large = sweep > Math.PI ? 1 : 0;
    const [x0, y0] = point(a0, r), [x1, y1] = point(a1, r), [ix0, iy0] = point(a0, inner), [ix1, iy1] = point(a1, inner);
    const d = slices.length === 1
      ? `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} M ${cx + inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy}`
      : `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${ix1.toFixed(2)} ${iy1.toFixed(2)} A ${inner} ${inner} 0 ${large} 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)} Z`;
    const pct = Math.round(frac * 100);
    const title = `${s.label}: ${s.count} (${pct}%)`;
    const filter = s.key === "__other" ? null : (s.filter ?? null);
    const path = `<path d="${d}" fill="var(--viz-${slot})" fill-rule="evenodd"><title>${esc(title)}</title></path>`;
    paths += filter ? `<a href="${esc(hrefBase)}?${esc(filter)}" data-filter="${esc(filter)}" aria-label="${esc(title)}">${path}</a>` : `<g aria-label="${esc(title)}">${path}</g>`;
    if (frac >= 0.07) {
      const [lx, ly] = point((a0 + a1) / 2, (r + inner) / 2);
      labels += `<text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" text-anchor="middle">${pct}%</text>`;
    }
    const name = filter ? `<a href="${esc(hrefBase)}?${esc(filter)}" data-filter="${esc(filter)}">${esc(s.label)}</a>` : esc(s.label);
    legend.push(`<li><span class="swatch" style="background:var(--viz-${slot})"></span><span class="name">${name}</span><span class="n">${s.count}</span></li>`);
  }
  const center = `<text class="center-n" x="${cx}" y="${cy + 2}" text-anchor="middle">${sum.toLocaleString("en-US")}</text><text class="center-l" x="${cx}" y="${cy + 18}" text-anchor="middle">${esc(opts.centerLabel ?? "records")}</text>`;
  return `<div class="pie"><svg viewBox="0 0 200 200" role="img" aria-label="Share of records by category">${paths}<g class="pie-labels">${labels}</g>${center}</svg><ul class="pie-legend">${legend.join("")}</ul></div>`;
}

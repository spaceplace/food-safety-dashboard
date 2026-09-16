// Probes which fetching strategies get past CDC's and USDA's bot protection from wherever this runs.
// Prints one line per (strategy, url). Never writes data. Safe to run anywhere.
import { execFileSync } from "node:child_process";

const targets = {
  "cdc-csv": "https://www.cdc.gov/foodborne-outbreaks/media/files/2024/04/full-outbreak-list.csv",
  "cdc-page": "https://www.cdc.gov/foodborne-outbreaks/outbreaks/index.html",
  "fsis-api": "https://www.fsis.usda.gov/fsis/api/recall/v/1",
  "fsis-rss": "https://www.fsis.usda.gov/fsis-content/rss/recalls.xml",
};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const chromeHeaders = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
};
const results = [];
const record = (strategy, name, status, note = "") => { results.push({ strategy, name, status, note }); console.log(`${strategy.padEnd(14)} ${name.padEnd(10)} ${String(status).padEnd(6)} ${note}`); };

// 1. Node fetch, minimal headers (what the fetchers do today)
for (const [name, url] of Object.entries(targets)) {
  try { const r = await fetch(url, { headers: { "User-Agent": UA } }); record("node-minimal", name, r.status, `${(await r.text()).length} bytes`); }
  catch (e) { record("node-minimal", name, "ERR", e.message); }
}
// 2. Node fetch, full Chrome header set
for (const [name, url] of Object.entries(targets)) {
  try { const r = await fetch(url, { headers: chromeHeaders }); record("node-chrome", name, r.status, `${(await r.text()).length} bytes`); }
  catch (e) { record("node-chrome", name, "ERR", e.message); }
}
// 3. curl with browser headers
for (const [name, url] of Object.entries(targets)) {
  try {
    const out = execFileSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--compressed", "-A", UA, "-H", "Accept: */*", "-H", "Accept-Language: en-US,en;q=0.9", url, "--max-time", "30"], { encoding: "utf8" });
    record("curl", name, out.trim());
  } catch (e) { record("curl", name, "ERR", e.message.split("\n")[0]); }
}
// 4. CDC content syndication API (a different CDC host that republishes page content)
try {
  const u = "https://tools.cdc.gov/api/v2/resources/media?url=" + encodeURIComponent("https://www.cdc.gov/foodborne-outbreaks/outbreaks/index.html");
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  const t = await r.text();
  let note = `${t.length} bytes`;
  if (r.ok) { try { const j = JSON.parse(t); const id = j.results?.[0]?.id; note += ` mediaId=${id}`; if (id) { const s = await fetch(`https://tools.cdc.gov/api/v2/resources/media/${id}/syndicate.json`, { headers: { "User-Agent": UA } }); const st = await s.text(); note += ` syndicate=${s.status} ${st.length} bytes hasTable=${/full-outbreak-list|cdc-datatable/.test(st)} hasCounts=${/Active investigations by germ/.test(st)}`; } } catch (e) { note += " parse-error"; } }
  record("cdc-syndicate", "cdc-page", r.status, note);
} catch (e) { record("cdc-syndicate", "cdc-page", "ERR", e.message); }
// 5. Headless Chromium via Playwright, if installed
try {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale: "en-US" });
  const page = await ctx.newPage();
  for (const [name, url] of Object.entries(targets)) {
    try { const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }); const body = await page.content(); record("playwright", name, resp?.status() ?? "?", `${body.length} bytes`); }
    catch (e) { record("playwright", name, "ERR", e.message.split("\n")[0]); }
  }
  await browser.close();
} catch (e) { record("playwright", "-", "SKIP", "playwright not installed: " + e.message.split("\n")[0]); }

console.log("\nSUMMARY (2xx = works):");
const ok = results.filter((r) => String(r.status).startsWith("2"));
for (const s of [...new Set(results.map((r) => r.strategy))]) console.log(`  ${s}: ${ok.filter((r) => r.strategy === s).map((r) => r.name).join(", ") || "nothing"}`);

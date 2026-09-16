// Runs every parser against the live sites without writing any files, and fails loudly if
// something comes back empty or missing key fields. GitHub Actions runs this daily so we
// notice when CDC, FDA, or USDA change their pages.

import { fetchCdcOutbreaks } from "./sources/cdc-outbreaks.js";
import { fetchCdcCounts } from "./sources/cdc-counts.js";
import { fetchOpenFda } from "./sources/fda-openfda.js";
import { fetchFsis } from "./sources/fsis-api.js";

const problems: string[] = [];
const check = (cond: boolean, msg: string) => { if (!cond) problems.push(msg); };
const log = (m: string) => console.log("  " + m);

console.log("CDC outbreaks");
try {
  const { items } = await fetchCdcOutbreaks({ log, minYear: new Date().getUTCFullYear() });
  check(items.length > 0, "CDC: zero outbreaks for the current year");
  const parsed = items.filter((o) => o.parseWarnings.length === 0);
  check(parsed.length >= Math.ceil(items.length / 2), `CDC: ${items.length - parsed.length} of ${items.length} outbreak pages had parse warnings`);
  check(items.some((o) => o.status === "active"), "CDC: no outbreak parsed as active (status parsing may be broken)");
  check(items.every((o) => o.postedAt), "CDC: some outbreaks have no posted date");
} catch (e) { problems.push(`CDC outbreaks fetch failed: ${(e as Error).message}`); }

console.log("CDC active counts");
try {
  const { counts } = await fetchCdcCounts();
  log(JSON.stringify(counts));
  check(counts.total > 0, "CDC counts: total is zero");
  check(!!counts.asOf, "CDC counts: no 'Last updated' date");
} catch (e) { problems.push(`CDC counts fetch failed: ${(e as Error).message}`); }

console.log("openFDA");
try {
  const { items, source } = await fetchOpenFda({ log, days: 60 });
  check(items.length > 0, "openFDA: zero recalls in the last 60 days");
  check(!!source.upstreamUpdated, "openFDA: no last_updated in response");
  check(items.every((r) => r.firm && r.product && r.reportDate), "openFDA: some recalls missing firm, product, or date");
} catch (e) { problems.push(`openFDA fetch failed: ${(e as Error).message}`); }

console.log("FSIS");
try {
  const { items, source } = await fetchFsis({ log, days: 120 });
  log(source.name);
  check(items.length > 0, "FSIS: zero recalls in the last 120 days");
  check(!source.name.includes("fallback"), "FSIS: API unavailable, using RSS fallback");
} catch (e) { problems.push(`FSIS fetch failed: ${(e as Error).message}`); }

if (problems.length) {
  console.error("\nLIVE CHECK FAILED:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("\nLive check passed.");

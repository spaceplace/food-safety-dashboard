// Weekly "this week in food safety" summary, written by Claude from the last 7 days of
// news items, agency notices, outbreak updates, and recalls. Runs inside the scheduled job,
// never per visitor. Every sentence must cite a numbered source or the summary is rejected.
//
// Usage: npm run summarize            (reuses a summary younger than 6 days)
//        npm run summarize -- --force (always regenerate)
// Needs ANTHROPIC_API_KEY in the environment or in a local .env file (never committed).

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkCitations } from "./lib/citations.js";
import { daysAgo, toIsoDay } from "./lib/dates.js";
import type { NewsFile, Outbreak, OutbreaksFile, Recall, RecallsFile, SummaryFile, SummarySource } from "./types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
export const SUMMARY_MODEL = "claude-haiku-4-5";
const MAX_AGE_DAYS = 6;

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

/** Minimal .env loader so a non-developer can put the key in a file instead of the shell. */
function loadDotEnv(): void {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

export interface SummaryInputs {
  news: NewsFile["items"];
  outbreaks: Outbreak[];
  recalls: Recall[];
  windowFrom: string;
  windowTo: string;
}

/** Pick and number the sources the model may cite. Agency material first, then news. */
export function buildSources(inputs: SummaryInputs, limit = 45): { sources: SummarySource[]; lines: string[] } {
  const { windowFrom } = inputs;
  const picked: Array<SummarySource & { detail: string }> = [];
  const outbreaks = inputs.outbreaks.filter((o) => (o.updatedAt ?? o.postedAt ?? "") >= windowFrom);
  for (const o of outbreaks) {
    picked.push({ n: 0, kind: "outbreak", title: o.title, source: "CDC outbreak notice", url: o.url, publishedAt: o.updatedAt ?? o.postedAt,
      detail: `Status: ${o.status === "active" ? "open" : o.status}. ${o.pathogen} linked to ${o.food}. Cases ${o.cases ?? "unknown"}, hospitalizations ${o.hospitalizations ?? "unknown"}, deaths ${o.deaths ?? "unknown"}, states ${o.stateCount ?? "unknown"}. Posted ${o.postedAt}, updated ${o.updatedAt}.` });
  }
  const recalls = inputs.recalls
    .filter((r) => (r.reportDate ?? "") >= windowFrom)
    .sort((a, b) => (a.classification ?? "Z").localeCompare(b.classification ?? "Z") || (b.reportDate ?? "").localeCompare(a.reportDate ?? ""))
    .slice(0, 12);
  for (const r of recalls) {
    picked.push({ n: 0, kind: "recall", title: r.title, source: r.agency === "FDA" ? "FDA enforcement report" : "USDA FSIS recall notice", url: r.url, publishedAt: r.reportDate,
      detail: `${r.classification ?? "Unclassified"}. Firm: ${r.firm}. Product: ${r.product}. Reason: ${r.reason || r.reasonCategory}. ${r.states?.length ? "States: " + r.states.join(", ") + "." : r.distributionPattern ? "Distribution: " + r.distributionPattern + "." : ""}` });
  }
  const news = inputs.news
    .filter((i) => i.publishedAt >= windowFrom)
    .sort((a, b) => (a.kind === b.kind ? b.publishedAt.localeCompare(a.publishedAt) : a.kind === "agency-notice" ? -1 : 1));
  for (const i of news) {
    picked.push({ n: 0, kind: i.kind, title: i.title, source: i.source, url: i.url, publishedAt: i.publishedAt, detail: i.excerpt });
  }
  const sources = picked.slice(0, limit).map((s, i) => ({ ...s, n: i + 1 }));
  const lines = sources.map((s) => `[${s.n}] (${s.kind}; ${s.source}; ${s.publishedAt?.slice(0, 10) ?? "undated"}) ${s.title}\n    ${s.detail}`);
  return { sources: sources.map(({ detail: _d, ...s }) => s), lines };
}

export const SYSTEM_PROMPT = `You write a short weekly food safety brief for the general public in the United States, published on an independent dashboard website.

Rules:
- Use only the numbered sources provided. Do not add any fact, number, or name that is not in a source. Do not speculate about causes or outcomes.
- Every sentence must end with one or more citations in square brackets, like [3] or [2][7], placed before the final period. A sentence without a citation is not allowed.
- Write 2 to 4 short paragraphs, 120 to 260 words total, in plain language a busy reader can skim. No headings, no bullet points, no title, no greeting, no sign-off.
- Lead with what matters most to consumers: open outbreaks and Class I recalls first, then other recalls and news. Mention the specific product, brand, and the action a consumer should take when a source states one.
- If a source says an outbreak is over, say so. If sources disagree, say so.
- Do not give medical advice beyond what a source states.
- The audience is in the United States. Mention events in other countries only when a source says the product was sold in the United States.
- Output only the paragraphs, separated by a blank line.`;

export function buildUserPrompt(inputs: SummaryInputs, lines: string[]): string {
  return `Week covered: ${inputs.windowFrom} to ${inputs.windowTo}.\n\nSources:\n${lines.join("\n")}\n\nWrite the brief now.`;
}

export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8")) as T; } catch { return null; }
}

export async function summarize(opts: { force?: boolean } = {}): Promise<SummaryFile> {
  loadDotEnv();
  const previous = await readJson<SummaryFile>("summary.json");
  const now = new Date();
  const write = async (s: SummaryFile) => { await writeFile(path.join(DATA_DIR, "summary.json"), JSON.stringify(s, null, 2) + "\n"); return s; };
  const keepPrevious = (status: SummaryFile["status"], note: string | null): SummaryFile => ({
    generatedAt: previous?.generatedAt ?? null, model: previous?.model ?? null, windowFrom: previous?.windowFrom ?? null, windowTo: previous?.windowTo ?? null,
    paragraphs: previous?.paragraphs ?? [], sources: previous?.sources ?? [], status, note, usage: previous?.usage ?? null,
  });

  if (!opts.force && previous?.generatedAt && now.getTime() - new Date(previous.generatedAt).getTime() < MAX_AGE_DAYS * 86_400_000) {
    log(`summary from ${previous.generatedAt} is under ${MAX_AGE_DAYS} days old; reusing (pass --force to regenerate)`);
    return write(keepPrevious("cached", null));
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    log("ANTHROPIC_API_KEY is not set; skipping summary");
    return write(keepPrevious("skipped", "ANTHROPIC_API_KEY not set; summary not generated this run"));
  }

  const news = (await readJson<NewsFile>("news.json"))?.items ?? [];
  const outbreaks = (await readJson<OutbreaksFile>("outbreaks.json"))?.items ?? [];
  const recalls = (await readJson<RecallsFile>("recalls.json"))?.items ?? [];
  const inputs: SummaryInputs = { news, outbreaks, recalls, windowFrom: toIsoDay(daysAgo(7, now)), windowTo: toIsoDay(now) };
  const { sources, lines } = buildSources(inputs);
  if (sources.length < 3) {
    log(`only ${sources.length} sources in the window; not generating`);
    return write(keepPrevious("failed", `Only ${sources.length} sources found for ${inputs.windowFrom} to ${inputs.windowTo}; summary not generated`));
  }
  log(`summarizing ${sources.length} sources for ${inputs.windowFrom} to ${inputs.windowTo} with ${SUMMARY_MODEL}`);

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildUserPrompt(inputs, lines) }];
  let usage = { inputTokens: 0, outputTokens: 0 };
  let lastProblems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({ model: SUMMARY_MODEL, max_tokens: 1500, system: SYSTEM_PROMPT, messages });
    } catch (e) {
      const msg = e instanceof Anthropic.APIError ? `API error ${e.status}: ${e.message}` : (e as Error).message;
      log(`summary request failed: ${msg}`);
      return write(keepPrevious("failed", msg));
    }
    usage = { inputTokens: usage.inputTokens + response.usage.input_tokens, outputTokens: usage.outputTokens + response.usage.output_tokens };
    if (response.stop_reason === "refusal") return write(keepPrevious("failed", "model declined to write the summary"));
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    const paragraphs = splitParagraphs(text);
    const check = checkCitations(paragraphs, sources.length);
    if (check.ok) {
      const used = new Set(check.cited);
      log(`summary ok: ${paragraphs.length} paragraphs, cites ${used.size} of ${sources.length} sources, ${usage.inputTokens} in / ${usage.outputTokens} out tokens`);
      return write({
        generatedAt: now.toISOString(), model: SUMMARY_MODEL, windowFrom: inputs.windowFrom, windowTo: inputs.windowTo,
        paragraphs, sources: sources.filter((s) => used.has(s.n)), status: "ok", note: null, usage,
      });
    }
    lastProblems = check.problems;
    log(`attempt ${attempt} rejected: ${check.problems.slice(0, 3).join(" | ")}`);
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `That draft was rejected by an automatic check:\n- ${check.problems.slice(0, 8).join("\n- ")}\n\nRewrite the whole brief so that every sentence ends with a valid citation in square brackets before its period, using only source numbers 1 to ${sources.length}. Output only the paragraphs.` });
  }
  return write(keepPrevious("failed", `Generated text failed the citation check twice: ${lastProblems.slice(0, 3).join("; ")}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  summarize({ force: process.argv.includes("--force") }).then((s) => log(`summary status: ${s.status}${s.note ? " (" + s.note + ")" : ""}`)).catch((e) => { console.error(e); process.exit(1); });
}

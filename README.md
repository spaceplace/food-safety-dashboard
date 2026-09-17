# Food Safety Dashboard

An always-current public view of the state of food safety in the US, built from CDC, FDA, and USDA data plus food-safety news. Nothing is fetched while a visitor is on the site: a scheduled job pulls every source, saves plain JSON files into `data/`, and the website is rebuilt from those files.

**Status: Phases 1 to 3 complete (data fetchers, the website, news and the weekly AI summary). Deployment is next.**

## What is here

| Folder | What it is |
|---|---|
| `fetch/` | The scheduled job. `run.ts` calls every source and writes `data/*.json`. One file per source lives in `fetch/sources/`. |
| `data/` | The JSON the website reads. Committed to the repo so its history is an audit trail of every number the agencies published. |
| `fixtures/` | Saved copies of the real CDC, FDA, and USDA responses, used by the tests. |
| `tests/` | One test file per parser. They run against the fixtures, so they work offline and catch layout changes when we refresh a fixture. |
| `site/` | The website, built with [Astro](https://astro.build). It reads `data/*.json` at build time and produces plain HTML. |
| `.github/workflows/` | GitHub Actions: the daily live check and the fetch-strategy probe (now), the 6-hourly data fetch and site deploy (Phase 4). |
| `PLAN.md` | The build plan, schemas, and what we learned about each source. |

## Data sources

| Source | How we read it | Refresh |
|---|---|---|
| CDC multistate outbreak notices | The CDC outbreaks page loads its table from a CSV file; we read that CSV, then each outbreak's own pages for counts, status, dates, and per-state cases. | Every 6 hours |
| CDC active investigation counts | Parsed from the outbreaks page text. | Every 6 hours |
| FDA food recalls | openFDA enforcement API, grouped one row per recall event. Dietary supplements are excluded; pet food is included and labeled. | Every 6 hours (openFDA itself updates weekly) |
| USDA FSIS recalls | FSIS recall API (full JSON), with the FSIS RSS feed as an automatic fallback. | Every 6 hours |
| News | Five RSS feeds: Food Safety News, FDA recalls, FDA outbreaks, FDA press releases (food topics only), Google News search. Title, link, date, and excerpt only. | Every 6 hours |
| Weekly AI summary | Claude Haiku 4.5 writes a short brief from the last 7 days of items above. Every sentence must cite a numbered source or the draft is rejected. | Weekly |

Note: CDC and FSIS sit behind bot protection that returns HTTP 403 to anything that does not look like a real browser. From GitHub's servers only a request carrying the full set of Chrome browser headers gets through (tested with `fetch/experiments/probe.mjs`, which you can rerun any time from the "Probe fetch strategies" workflow on GitHub). All fetching goes through `fetch/lib/http.ts`, which sends those headers.

## Run it on your own computer

You need [Node.js](https://nodejs.org) version 22 or newer. Then, in a terminal, from this folder:

```bash
npm install
```

Fetch fresh data from all sources (takes about 15 seconds, writes `data/outbreaks.json`, `data/recalls.json`, `data/status.json`):

```bash
npm run fetch
```

Run the tests (offline, uses the saved fixtures):

```bash
npm test
```

Generate the weekly AI summary (needs an Anthropic API key, see below; costs about one cent per run; reuses a summary younger than 6 days unless you add `-- --force`):

```bash
npm run summarize
```

Check the parsers against the live websites without writing anything (this is what GitHub runs daily):

```bash
npm run check:live
```

Preview the website on your own computer (then open http://localhost:4321/food-safety-dashboard/ in a browser; press Ctrl+C in the terminal to stop it):

```bash
npm run dev
```

Build the finished website into `site/dist/` (this is what gets published):

```bash
npm run build
```

## The API key for the summary

The summary needs an Anthropic API key. It is read from an environment variable named `ANTHROPIC_API_KEY`. On your own computer the easiest way is a file named `.env` in this folder containing one line:

```
ANTHROPIC_API_KEY=sk-ant-...your key...
```

That file is listed in `.gitignore`, so it is never uploaded to GitHub. On GitHub, the same key is stored as a repository secret (Settings, then Secrets and variables, then Actions) and the workflow passes it to the job. Never paste the key into any file that is committed, and never share it in chat.

If the key is missing, the job still runs; it just leaves the previous summary in place and records "skipped" in `data/summary.json`.

## When a source fails

Each source is fetched independently. If one fails, its previous items are kept, and `data/status.json` records `ok: false` with the error and the time of the last good fetch. The website shows that as a warning banner and marks the affected section "last refresh failed; showing previous data" rather than showing nothing or a made-up value.

## Deploying

Coming in Phase 4. The plan is GitHub Pages, rebuilt automatically by GitHub Actions after every data fetch.

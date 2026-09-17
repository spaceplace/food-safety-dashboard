# Food Safety Brief

An always-current public view of the state of food safety in the US, built from CDC, FDA, and USDA data plus food-safety news. Nothing is fetched while a visitor is on the site: a scheduled job pulls every source, saves plain JSON files into `data/`, and the website is rebuilt from those files.

**Live site: https://foodsafetybrief.org**

**Status: Phases 1 to 4 complete. The site is deployed and refreshes itself every 6 hours.**

## What is here

| Folder | What it is |
|---|---|
| `fetch/` | The scheduled job. `run.ts` calls every source and writes `data/*.json`. One file per source lives in `fetch/sources/`. |
| `data/` | The JSON the website reads. Committed to the repo so its history is an audit trail of every number the agencies published. |
| `fixtures/` | Saved copies of the real CDC, FDA, and USDA responses, used by the tests. |
| `tests/` | One test file per parser. They run against the fixtures, so they work offline and catch layout changes when we refresh a fixture. |
| `site/` | The website, built with [Astro](https://astro.build). It reads `data/*.json` at build time and produces plain HTML. |
| `.github/workflows/` | GitHub Actions: the 6-hourly fetch-and-deploy job, the daily summary job, the daily live check, and the fetch-strategy probe. |
| `PLAN.md` | The build plan, schemas, and what we learned about each source. |

## Data sources

| Source | How we read it | Refresh |
|---|---|---|
| CDC multistate outbreak notices | The CDC outbreaks page loads its table from a CSV file; we read that CSV, then each outbreak's own pages for counts, status, dates, and per-state cases. | Every 6 hours |
| CDC active investigation counts | Parsed from the outbreaks page text. | Every 6 hours |
| FDA food recalls | openFDA enforcement API, grouped one row per recall event. Dietary supplements are excluded; pet food is included and labeled. | Every 6 hours (openFDA itself updates weekly) |
| USDA FSIS recalls | FSIS recall API (full JSON), with the FSIS RSS feed as an automatic fallback. | Every 6 hours |
| News | Five RSS feeds: Food Safety News, FDA recalls, FDA outbreaks, FDA press releases (food topics only), Google News search. Title, link, date, and excerpt only. | Every 6 hours |
| Daily AI summary | Claude Haiku 4.5 writes a short brief from the last 7 days of items above. Every sentence must cite a numbered source or the draft is rejected. | Every morning at 7:30 AM US Eastern |

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

Generate the daily AI summary (needs an Anthropic API key, see below; costs about one cent per run; reuses a summary younger than a day unless you add `-- --force`):

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

## How it runs on its own

Everything automatic happens in GitHub Actions (the "Actions" tab of the repository). You do not need to keep your computer on.

| Job | When | What it does |
|---|---|---|
| Fetch data and deploy site | Every 6 hours, and after every code change | Runs the tests, fetches every source, regenerates the summary only if it is over a day old (a backstop in case the morning job failed), commits changed data files, builds the site, publishes it to GitHub Pages. |
| Daily news summary | Every morning at 7:30 AM US Eastern (adjusts for daylight saving time) | Forces a fresh AI summary, commits it, then starts the job above to publish it. |
| Live source check | Daily | Runs the parsers against the real CDC, FDA, and USDA sites and fails loudly if a site changed shape. GitHub emails you when a scheduled job fails. |
| Probe fetch strategies | By hand only | Diagnostic for when CDC or USDA start returning "403 Forbidden" to GitHub's servers. |

To run any job by hand: Actions tab, pick the job on the left, "Run workflow". The fetch-and-deploy job has a checkbox to force a new summary.

### Where the site lives

GitHub Pages serves the built site at https://foodsafetybrief.org. The old address https://spaceplace.github.io/food-safety-dashboard/ redirects there. Two things keep this working:

- The repository setting "Pages, Source: GitHub Actions" stays on, and "Custom domain" says `foodsafetybrief.org` with "Enforce HTTPS" ticked.
- The DNS records at the registrar (GoDaddy) stay as set on 2026-09-17: four `A` records for `@` pointing at `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; four `AAAA` records for `@` pointing at `2606:50c0:8000::153` through `2606:50c0:8003::153`; and a `CNAME` for `www` pointing at `spaceplace.github.io`. No other `A` record for `@` (GoDaddy's "WebsiteBuilder Site" record must stay deleted).

The file `site/public/CNAME` holds the domain name and is published with every deploy; do not delete it.

### Changing domain later

Buy the domain, add the same DNS records at the new registrar, change the name in `site/public/CNAME` and in `astro.config.mjs`, and update "Custom domain" in the Pages settings. GitHub's guide: https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site

### Secrets

The only secret is `ANTHROPIC_API_KEY`, stored under Settings, Secrets and variables, Actions. Rotate it there if it ever leaks. Nothing else needs credentials.

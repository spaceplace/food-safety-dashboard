# Food Safety Dashboard

An always-current public view of the state of food safety in the US, built from CDC, FDA, and USDA data plus food-safety news. Nothing is fetched while a visitor is on the site: a scheduled job pulls every source, saves plain JSON files into `data/`, and the website is rebuilt from those files.

**Status: Phase 1 (data fetchers) complete. The website itself is not built yet.**

## What is here

| Folder | What it is |
|---|---|
| `fetch/` | The scheduled job. `run.ts` calls every source and writes `data/*.json`. One file per source lives in `fetch/sources/`. |
| `data/` | The JSON the website reads. Committed to the repo so its history is an audit trail of every number the agencies published. |
| `fixtures/` | Saved copies of the real CDC, FDA, and USDA responses, used by the tests. |
| `tests/` | One test file per parser. They run against the fixtures, so they work offline and catch layout changes when we refresh a fixture. |
| `.github/workflows/` | GitHub Actions: the daily live check (now), the 6-hourly data fetch and site deploy (Phase 4). |
| `PLAN.md` | The build plan, schemas, and what we learned about each source. |

## Data sources

| Source | How we read it | Refresh |
|---|---|---|
| CDC multistate outbreak notices | The CDC outbreaks page loads its table from a CSV file; we read that CSV, then each outbreak's own pages for counts, status, dates, and per-state cases. | Every 6 hours |
| CDC active investigation counts | Parsed from the outbreaks page text. | Every 6 hours |
| FDA food recalls | openFDA enforcement API, grouped one row per recall event. Dietary supplements are excluded; pet food is included and labeled. | Every 6 hours (openFDA itself updates weekly) |
| USDA FSIS recalls | FSIS recall API (full JSON), with the FSIS RSS feed as an automatic fallback. | Every 6 hours |

Note: CDC and FSIS reject plain command-line requests (`curl` gets HTTP 403). Node's built-in `fetch` with normal browser headers gets through. All fetching goes through `fetch/lib/http.ts` for that reason.

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

Check the parsers against the live websites without writing anything (this is what GitHub runs daily):

```bash
npm run check:live
```

## When a source fails

Each source is fetched independently. If one fails, its previous items are kept, and `data/status.json` records `ok: false` with the error and the time of the last good fetch. The website (Phase 2) will show that as a warning next to the affected numbers rather than showing nothing or a made-up value.

## Deploying

Coming in Phase 4. The plan is GitHub Pages, rebuilt automatically by GitHub Actions after every data fetch.

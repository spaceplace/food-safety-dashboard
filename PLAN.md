# Food Safety Dashboard: Build Plan

Written 2026-09-16 after probing every data source in the brief. Nothing has been built yet.

## 1. What I learned from probing the sources

| Source | Result | What it means for us |
|---|---|---|
| CDC outbreaks page | Works from Node, blocked for `curl` (Akamai bot protection). The notices table is **not** in the HTML; it is loaded by a CDC "datatable" widget from a CSV file: `/foodborne-outbreaks/media/files/2024/04/full-outbreak-list.csv` (3 columns: Contaminated Food with link, Germ, Year; ~235 rows back to 2006). | Parse the CSV, not the HTML. Far more stable. |
| CDC outbreak pages | Each outbreak has `index.html` with a "Fast Facts" box (Cases, Hospitalizations, Deaths, States), an "Investigation status: Active/Closed" line, the sentence "This outbreak is over." when closed, and Published / Updated dates. `investigation.html` has the illness date range; `locations.html` has the state list. | We can get every field the brief asks for. "Open" = status Active and no "outbreak is over" sentence. |
| CDC active-investigation counts | Server-rendered on the page ("Campylobacter: 3, E. coli: 6, Listeria: 6, Salmonella: 23, Last updated 9/16/2026"). | Easy to parse and show as a "CDC is currently working N investigations" figure. |
| openFDA food enforcement | Works, no key needed. `last_updated` 2026-09-09. | Primary FDA recall source. |
| FDA RSS | The URLs in the brief are 404. The live feeds are `/about-fda/contact-fda/stay-informed/rss-feeds/food-safety-recalls/rss.xml`, `.../fda-outbreaks/rss.xml`, `.../press-releases/rss.xml`. | Use these for timeliness and for news. |
| FDA outbreaks table page | Works (server-rendered HTML). | Secondary outbreak source, for cross-checking. |
| USDA FSIS recall API | Blocked for `curl`, works from Node. Returns the full recall history as one 13 MB JSON (2,025 records) with clean fields: title, recall number, date, classification, reason, products, states, "related to outbreak" flag, URL. | Primary FSIS source. RSS also works as a fallback. |
| Food Safety News RSS, Google News RSS | Work. | News sources. |

**One risk to flag now.** CDC and FSIS block requests that "look like a bot." Node from my Mac gets through; GitHub's servers might not. I will test this in Phase 1 by running the fetch job in GitHub Actions early, and if it is blocked the fallback is to run the fetch job somewhere else (for example on a tiny free Cloudflare Worker, or on your own machine on a schedule). The website itself is unaffected either way.

## 2. Proposed stack (plain-terms reasoning)

- **Language: TypeScript on Node 22.** One language for the fetch job, the tests, and the site. Node's built-in fetch is what got us through the bot protection.
- **Site: Astro.** It produces plain static HTML with no JavaScript unless a page needs it, which makes it fast, accessible, and cheap. Next.js is heavier and built for apps with logins and live data, which we do not have.
- **Hosting: GitHub Pages**, deployed by GitHub Actions. The same GitHub Actions that fetch the data can rebuild and publish the site, so everything lives in one place and costs nothing. Vercel or Netlify would also work and are easy to switch to later; the main reason to choose one of them instead would be if you want their prettier deployment previews.
- **Data storage: JSON files committed into the repo** under `data/`. The scheduled job fetches, writes the files, and commits them. Benefits: the git history becomes a free audit trail of every change CDC and FDA ever published, and "last good data" fallback is automatic (if a fetch fails, the old file simply stays).
- **Tests: Vitest**, running each parser against a saved copy of the real page or API response stored in `fixtures/`. A CI step also runs the parsers against the live sites daily and fails loudly if they return nothing, so we notice when CDC changes their HTML.
- **AI summary: Claude Haiku 4.5** via the Anthropic API, called once a week inside the job, with the result cached in `data/summary.json`. Cost is roughly a cent per run. The prompt forces every sentence to end with a citation like `[3]` pointing at a numbered source; the code rejects any summary containing a citation number not in the list.
- **No analytics, no cookies, no third-party scripts.**

## 3. Folder layout

```
food-safety-dashboard/
├── README.md                 non-developer guide: run locally, deploy, add a secret
├── PLAN.md                   this file
├── package.json
├── data/                     the JSON the site renders from (committed)
│   ├── outbreaks.json
│   ├── recalls.json
│   ├── news.json
│   ├── summary.json
│   └── status.json           per-source fetch status and "as of" timestamps
├── fetch/                    the scheduled job
│   ├── run.ts                runs every fetcher, each in its own try/catch, writes data/
│   ├── sources/
│   │   ├── cdc-outbreaks.ts  CSV list + per-outbreak page parsing
│   │   ├── cdc-counts.ts     active investigations by germ
│   │   ├── fda-openfda.ts
│   │   ├── fda-rss.ts
│   │   ├── fda-outbreak-table.ts
│   │   ├── fsis-api.ts       with RSS fallback inside
│   │   └── news.ts           FSN, FDA press, Google News
│   ├── summarize.ts          weekly Claude call
│   ├── foods.ts              food-name normalizer ("Romaine lettuce" -> "lettuce")
│   └── lib/                  shared http client (browser-like headers, retries), date helpers
├── fixtures/                 saved real responses used by tests
├── tests/                    one test file per parser
├── site/                     Astro website
│   ├── src/pages/            index, recalls, outbreaks, methods, (later) rss.xml
│   ├── src/components/
│   └── src/lib/              reads data/*.json, formats numbers and dates
└── .github/workflows/
    ├── fetch.yml             cron every 6 hours: fetch -> commit data -> build -> deploy
    └── summary.yml           cron weekly: news summary -> commit -> build -> deploy
```

## 4. JSON schemas

All files share a wrapper so the site can show honest timestamps and warnings:

```jsonc
{
  "generatedAt": "2026-09-16T22:10:00Z",     // when the job ran
  "sources": {                                // one entry per upstream source
    "cdc-outbreak-list": {
      "url": "https://www.cdc.gov/foodborne-outbreaks/outbreaks/",
      "fetchedAt": "2026-09-16T22:09:41Z",   // last successful fetch
      "ok": true,
      "error": null,                         // message when ok is false; site shows a warning
      "upstreamUpdated": "2026-09-16"        // the date the source itself claims, when it gives one
    }
  },
  "items": [ ... ]
}
```

### Outbreak (`data/outbreaks.json` items)

```jsonc
{
  "id": "cdc:salmonella/outbreaks/broccoli-sprouts-09-26",
  "agency": "CDC",
  "url": "https://www.cdc.gov/salmonella/outbreaks/broccoli-sprouts-09-26/index.html",
  "title": "Salmonella Outbreak Linked to Broccoli Sprouts",
  "food": "Broccoli Sprouts",           // exactly as CDC wrote it
  "foodKeys": ["sprouts"],              // normalized, for the "recently implicated foods" grouping
  "pathogen": "Salmonella Bovismorbificans",
  "pathogenFamily": "Salmonella",       // one of Salmonella, E. coli, Listeria, Campylobacter, Cyclospora, Botulism, Other
  "status": "active",                   // "active" | "over" | "unknown"
  "cases": 22,
  "hospitalizations": 2,
  "deaths": 0,
  "stateCount": 4,
  "states": ["CA", "OR", "WA", "ID"],   // from locations.html; empty if not parsed
  "illnessOnsetFrom": "2026-07-07",
  "illnessOnsetTo": "2026-08-26",
  "postedAt": "2026-09-09",             // CDC "Published"
  "updatedAt": "2026-09-11",            // CDC "Updated"
  "recallIssued": true,
  "year": 2026,
  "fetchedAt": "2026-09-16T22:09:41Z"
}
```

Headline numbers = sum of `cases`, `hospitalizations`, `deaths` over items with `postedAt` in the trailing 12 months (regardless of whether they are now over). Open outbreaks = `status == "active"`.

### Recall (`data/recalls.json` items)

```jsonc
{
  "id": "fda:F-1234-2026" | "fsis:021-2026",
  "agency": "FDA" | "FSIS",
  "url": "...",                         // FSIS notice page, or FDA recalls page / openFDA record
  "title": "...",                       // FSIS headline, or FDA "firm recalls product" built from fields
  "firm": "El Eden Import Distributor Corp",
  "product": "45-g foil bags of De Todito NATURAL mixed chips ...",
  "foodKeys": ["pork"],
  "reason": "Import Violation",
  "reasonCategory": "listeria" | "salmonella" | "ecoli" | "undeclared-allergen" | "foreign-material" | "other",
  "classification": "Class I" | "Class II" | "Class III" | null,
  "status": "Ongoing" | "Completed" | "Terminated" | "Active" | "Closed",
  "states": ["NJ", "UT"] | null,        // FSIS gives a list; FDA gives free text in distributionPattern
  "distributionPattern": "Nationwide",
  "relatedToOutbreak": false,
  "recallDate": "2026-09-09",           // FSIS recall date / FDA recall_initiation_date
  "reportDate": "2026-09-09",           // FDA report_date (when FDA posted it)
  "fetchedAt": "..."
}
```

### News item (`data/news.json` items)

```jsonc
{
  "id": "sha1 of the link",
  "source": "Food Safety News" | "FDA press release" | "FDA recall notice" | "Google News: <outlet>",
  "title": "...",
  "url": "...",
  "publishedAt": "2026-09-15T14:02:00Z",
  "excerpt": "first ~300 characters, HTML stripped",
  "kind": "news" | "agency-notice"
}
```

### Summary (`data/summary.json`)

```jsonc
{
  "generatedAt": "2026-09-14T06:00:00Z",
  "model": "claude-haiku-4-5-20251001",
  "windowFrom": "2026-09-07", "windowTo": "2026-09-14",
  "paragraphs": ["... [1] ... [3]", "..."],
  "sources": [ { "n": 1, "title": "...", "url": "...", "source": "...", "publishedAt": "..." } ]
}
```

## 5. Build order

- **Phase 1 (fetchers + tests).** Shared HTTP client; CDC list CSV + outbreak page parser + counts parser; openFDA; FSIS API with RSS fallback; `status.json`; fixtures + tests; a live-run script that prints what it found. I will also push an early GitHub Actions run to answer the "does CDC block GitHub" question. *Stop for review.*
- **Phase 2 (site).** Astro site with the home page (headline numbers + burden comparison, open outbreaks table, recently implicated foods, recent recalls), a recalls page, and the Data and Methods page. Warning banners driven by `status.json`. Mobile and accessibility pass. *Stop for review.*
- **Phase 3 (news + AI summary).** News fetchers (FSN, FDA feeds, Google News), the weekly Claude summary with enforced citations, summary section on the home page. *Stop for review.*
- **Phase 4 (deploy + schedule).** GitHub repo, Pages, the two workflows, secrets, README. *Stop for review.*
- **Phase 5 (nice-to-haves)** in this order: 12-month trend chart, pathogen breakdown, US map, "is [food] safe right now" search (client-side over the same JSON), RSS feed for new outbreaks, then email signup (this one needs an outside service, decide later).

# Food Safety Dashboard — starter prompt

Paste everything below this line into Claude Code (or another coding agent) from inside this folder.

---

I want to build a public website called the **Food Safety Dashboard**: an always-current view of the state of food safety in the US, built from CDC, FDA, and USDA data plus food-safety news. Treat me as a product owner, not a developer: explain choices in plain terms, and ask me before making decisions that are hard to undo.

## What the site must show

1. **Headline numbers** for the trailing 12 months: illnesses, hospitalizations, and deaths. These come from summing CDC multistate outbreak investigation notices posted in that window. Label them honestly, for example "Reported in CDC multistate outbreak investigations, last 12 months." These undercount true burden by a huge margin, so next to them show CDC's official annual burden estimate (about 9.9 million illnesses, 53,300 hospitalizations, 931 deaths per year from the seven major pathogens, 2019 estimates published 2025, source https://www.cdc.gov/foodborneburden/index.html) with a one-line explanation of the difference.
2. **Open outbreaks**: a list of active CDC multistate foodborne outbreak investigations. Each row shows food, pathogen, case count, hospitalizations, deaths, states affected, date posted or last updated, and links to the CDC investigation page.
3. **Recently implicated foods**: the foods linked to outbreaks and recalls in the last 90 days, grouped by food, so someone can see at a glance whether "lettuce" or "eggs" is currently in the news.
4. **Recent recalls**: FDA and USDA FSIS food recalls, with reason, classification, product, firm, and date, linking to the source.
5. **This week's food safety news**: an AI-generated summary (a few paragraphs) built from the last 7 days of news items and agency notices. Every claim in the summary must be traceable to a listed source. Show the source links under the summary and the timestamp when it was generated.
6. A **"Data and methods" page** explaining every source, how often it refreshes, and what the numbers do and do not mean.

Nice to have, after the above works: a US map of states in active outbreaks, a 12-month trend chart of outbreaks per month, a pathogen breakdown, an RSS feed and email signup for new outbreaks, and a search box for "is [food] safe right now" that checks open outbreaks and recalls.

## Data sources (verified September 2026)

- **CDC active multistate investigations**: https://www.cdc.gov/foodborne-outbreaks/outbreaks/ shows counts of active investigations by pathogen and a table of outbreak notices. There is no RSS or JSON feed. Inspect the page to see whether the table is rendered server-side or loaded from a JSON endpoint; use whichever is more stable. Individual investigation pages (for example https://www.cdc.gov/salmonella/outbreaks/broccoli-sprouts-09-26/investigation.html) contain total cases, hospitalizations, deaths, states, illness date range, posted and updated dates, and a statement when the outbreak is declared over. Parse those.
- **CDC burden estimates**: static numbers, cite the page above.
- **CDC NORS / BEAM dashboard** (https://www.cdc.gov/nors/index.html and data.cdc.gov dataset 5xkq-dg7x): full historical outbreak data, but it lags one to two years, so use it only for historical context, never for the trailing-12-month numbers.
- **FDA recalls**: the openFDA endpoint https://api.fda.gov/food/enforcement.json works without a key (higher limits with a free key), returns JSON, updates weekly, and reports its own last_updated date. FDA says not to use it for public alerts, so for timeliness also pull the FDA recalls page or its RSS at https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts.
- **FDA outbreak investigations table**: https://www.fda.gov/food/outbreaks-foodborne-illness/investigations-foodborne-illness-outbreaks
- **USDA FSIS recalls** (meat, poultry, eggs): documented at https://www.fsis.usda.gov/science-data/developer-resources/recall-api. Warning: the JSON endpoint returned HTTP 403 to plain HTTP requests when I tested it, so it is behind bot protection. Test it early; if it stays blocked, fall back to the FSIS recalls RSS feed.
- **News**: Food Safety News RSS (https://www.foodsafetynews.com/feed/), FDA press releases RSS, and a Google News RSS query for "foodborne outbreak OR food recall." Store title, link, source, published date, and a short excerpt only.

## How it should be built

- Keep the architecture simple: a scheduled job fetches all sources, normalizes them into JSON files, and the website renders from those files. No live fetching of CDC or FDA on page load. Prefer a static site (Astro or Next.js) deployed to Vercel, Netlify, or GitHub Pages, with the fetch job run by GitHub Actions on a cron (every 6 hours for data, weekly for the AI summary).
- Use the Claude API for the news summary using a cheaper Claude model, run inside the scheduled job and cached, so the site never calls the API per visitor. Put the API key in an environment variable and never in the repo.
- Every number on the site carries a visible "as of" timestamp and a source link. If a source fails to fetch, show the last good data with a warning, never a blank or a fabricated value.
- Write fetchers so each source can fail independently. Add a small test for each parser using a saved copy of the real page or API response, so that we notice when CDC or FDA changes their HTML.
- Mobile-friendly, fast, accessible, and no tracking.

## How I want to work

1. First, write a short plan: proposed stack, folder layout, the JSON schema for outbreaks, recalls, and news items, and the order you will build things. Ask me any questions before writing code.
2. Then build in phases, and stop after each so I can review:
   - Phase 1: fetchers for CDC outbreaks and openFDA recalls, saving JSON, with tests. Prove the CDC parsing works on the live site.
   - Phase 2: the website reading that JSON, with the headline numbers, open outbreaks, recalls, and methods page.
   - Phase 3: news ingestion and the AI weekly summary.
   - Phase 4: deployment and the scheduled job.
   - Phase 5: nice-to-haves.
3. Keep a README that a non-developer could follow to run it locally and deploy it.

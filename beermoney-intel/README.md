# Beermoney Intel

A desktop research & content-intelligence app for running a survey / beermoney affiliate content business. Built with Electron.

![Status: free data sources](https://img.shields.io/badge/data-free%20sources-green)

## What it does

### Core research
1. **Top Questions** — the 20 most-asked, most-discussed survey/beermoney questions over the last **30 / 60 / 90 days**, ranked by community engagement (Reddit score + 2× comments) across r/beermoney, r/SwagBucks, r/ProlificAc, r/WorkOnline (configurable). Every question links to the source thread and can be exported as CSV or a Markdown brief.
2. **Top Sites** — the most talked-about survey/beermoney sites in the same windows, with mention counts, an engagement bar chart, and a **trend arrow vs the previous period** so you can see which sites are heating up or cooling off.

### Power features
- **🎯 Opportunity Engine** — every trending question scored 0-100 from four signals: community engagement (0-50), freshness (0-20), whether your Content Planner already covers it (0-15), and SERP competition weakness (0-15). One ranked "what to make next" list.
- **🔍 SERP Competition Checker** — checks who actually ranks for a keyword (via DuckDuckGo, no API key) and classifies domains as weak (Reddit/Quora/forums — you can outrank them) vs strong (NerdWallet, Penny Hoarder…). Cached 7 days per keyword.
- **🧠 Pain Point Miner** — pulls hundreds of comments from the top threads about a site and extracts the most-repeated phrases and complaint sentences. Comment-level intel your competitors never see.
- **🕵️ Competitor Tracker** — follow competing blogs (RSS) and YouTube channels (channel feed) — latest posts, publishing cadence, one-click idea generation from their headlines.
- **📈 Site Momentum** — the app snapshots mention counts daily; Top Sites grows sparklines showing which sites are trending up or down over weeks, not just one period.
- **🤖 AI Draft Writer** — paste your own Claude API key in Settings and the Idea Generator's briefs become full first drafts (blog post, YouTube script, or newsletter email), streamed live, with `[VERIFY]` markers wherever a figure needs checking and an FTC disclosure built in. Uses the official Anthropic SDK; defaults to Claude Opus 4.8.

- **🏭 Draft Factory** — tick multiple opportunities and queue them all as one Claude *batch* (Message Batches API, **50% of standard token cost**). Come back to a folder of finished drafts to review, save, or copy.
- **📰 Intelligence Briefing** — one click feeds the period's live data (top questions, site trends, complaint spikes, watchlist hits) to Claude and returns an analyst report: what to make next, what's becoming risky to promote, what's time-sensitive — plus a ready-to-send newsletter version.
- **📊 Rank Tracker** — set your domain in Settings, add your target keywords, and check where your site ranks in the top 10 per keyword. Keeps position history with trend arrows.
- **🔔 Autopilot & Alerts** — background auto-refresh on an interval with desktop notifications for new watchlist matches, fast-rising posts (cover them first), and complaint spikes (protect your audience). All alerts also collect in the Alerts tab.

### The 8 extra features
3. **Keyword Explorer** — fans a seed keyword out through Google Autocomplete (question prefixes + a–z expansions) to surface what people actually type into Google. Question-type suggestions are split out — those are your article topics.
4. **Idea Generator** — turns any question/keyword into 6 blog titles, 5 YouTube titles + 3 opening hooks, 4 email subject lines, and a full SEO article outline (with affiliate-placement pointers). One click to copy any line, export a `.md` brief, or push to the planner.
5. **Content Planner** — pipeline tracker (idea → drafting → published) per piece, tied to its content type, target keyword, affiliate site, and due date.
6. **Affiliate Link Manager** — every program's link, commission terms, and cookie window in one place with copy-to-clipboard.
7. **Site Database** — built-in reference data for 24 popular sites (min payout, payout methods, referral program) plus your own custom sites; custom sites are automatically tracked in Top Sites and Reputation.
8. **Rising & Watchlist** — posts gaining engagement fastest in the last 48 hours (be first to cover them), plus a keyword watchlist (e.g. "prolific waitlist") with match alerts.
9. **Reputation Monitor** — per-site scam/ban/non-payment complaint counts with sample threads. Protects your audience's trust, and "is X legit?" angles convert extremely well.
10. **Revenue Tracker** — log commissions per program and per content piece, with monthly charts and a best-program breakdown, so you double down on what earns.

## Data sources

- **Free, no keys needed:** Reddit public JSON (post titles/engagement, cached locally, refreshed every 6h by default) and Google Autocomplete.
- **Paid, pluggable:** real monthly search volumes can be added later by implementing a provider in `lib/providers/index.js` (DataForSEO, SerpApi, etc.) and pasting the API key in **Settings** — the Keyword Explorer picks it up automatically.
- If the network is down, the app falls back to cached data, then to a clearly-labelled bundled demo dataset, so it always opens.

All your data (plans, links, revenue, settings) is stored locally as JSON files in the app's user-data folder. Nothing leaves your machine except the requests to Reddit/Google.

## Running it (development)

Requires [Node.js](https://nodejs.org) 20+.

```sh
cd beermoney-intel
npm install
npm start
```

## Building the Windows app

```sh
npm run dist:win
```

This produces both an installer (`dist/Beermoney Intel Setup 1.0.0.exe`) and a portable `.exe` in `beermoney-intel/dist/`. Run it on a Windows machine (building Windows targets from Linux/Mac requires Wine).

## Tests

```sh
npm test                 # logic tests (no Electron needed)
```

## Project layout

```
main.js                 Electron main process + IPC handlers
preload.js              Safe bridge exposed to the UI as window.api
lib/analyze.js          Question ranking, site mentions, rising, reputation
lib/sites.js            Seed site database (aliases drive mention matching)
lib/ideas.js            Offline content-idea templates
lib/providers/reddit.js Reddit fetcher with cache → stale cache → demo fallback
lib/providers/autocomplete.js  Google Autocomplete fan-out
lib/providers/index.js  Pluggable search-volume provider layer (add paid APIs here)
lib/store.js            JSON-file persistence
src/                    The UI (vanilla HTML/CSS/JS, no build step)
test/                   Logic tests + an Electron smoke test with screenshots
```

# Survey Tracker

Two tools for a survey / beermoney affiliate content business:

1. **[Beermoney Intel](beermoney-intel/)** — an Electron **desktop app** for research and content intelligence: top community questions (30/60/90 days), most-mentioned survey sites with trends, keyword explorer, idea generator, content planner, affiliate link manager, site database, rising-topic alerts, reputation monitor, and revenue tracking. See [`beermoney-intel/README.md`](beermoney-intel/README.md).
2. **Survey Earnings Tracker** (this folder) — a simple, dependency-free web app for tracking personal survey earnings, described below.

# Survey Earnings Tracker

A simple, dependency-free web app for tracking how much you earn from survey platforms.

## Features

- **Add earnings** with an amount, platform, and date/time (defaults to now)
- **Daily / Weekly / Monthly / Yearly views** with prev/next navigation and a "Today" shortcut
- **Bar charts** of earnings per day, month, or platform depending on the view
- **Summary cards** for today, this week, this month, this year, and all time
- **Per-platform breakdown** with totals, entry counts, and share of earnings
- **Edit and delete** entries
- **Managed platform list** — add your platforms once, pick from a dropdown after that
- **CSV export** of all entries
- **Configurable currency symbol** (default `$`)

All data is stored locally in your browser (`localStorage`) — no account, no server, works offline.

## Running it

No build step or dependencies. Either:

- Open `index.html` directly in your browser, or
- Serve the folder and open http://localhost:8000:

  ```sh
  python3 -m http.server 8000
  ```

## Usage

1. Click **⚙ Platforms & Settings** and add the survey platforms you use (e.g. Prolific, Swagbucks).
2. Use the **Add earning** form to log each payout — the date/time defaults to now but can be changed.
3. Switch between **Daily / Weekly / Monthly / Yearly** tabs and use **‹ ›** to browse past periods.
4. Use **⬇ Export CSV** to download all your entries as a spreadsheet.

> **Note:** Data lives in the browser you use it in. Clearing site data will erase it, so export a CSV now and then as a backup.

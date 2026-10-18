# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Marquee Manager: a single-page app for running an event / wedding hall (bookings for Barat, Walima, Mehndi etc., staff, salaries, expenses, assets, dashboard, printable monthly profit report). Amounts are in Rs and the UI targets Pakistani users (`en-PK` number formatting, `03xx` phone numbers).

There is no build step, bundler, linter, or test suite. The whole front end is one file, `index.html` (inline CSS + one inline `<script>`; Lucide icons from unpkg). The optional backend is `server.js` (Express + `pg`).

## Running

```bash
# Browser-only mode: just open the file; data lives in localStorage
open index.html

# Server mode: PostgreSQL-backed, password login
npm install
DATABASE_URL=postgres://localhost:5432/marquee APP_PASSWORD=at-least-6-chars node server.js   # or npm start
```

Optional env: `PORT` (default 3000), `SESSION_SECRET` (defaults to a hash of `APP_PASSWORD`). `sslmode=require` in `DATABASE_URL` turns on SSL. On startup the server runs all of `schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`) before listening, and prints a hint for common Postgres connection errors.

## Architecture

**Two storage modes, chosen at runtime.** `boot()` in `index.html` checks whether the page was loaded over http(s) and whether `GET /api/session` answers 200 or 401. If so it swaps the global `DB` to `ApiAdapter()`, otherwise it keeps `LocalAdapter` (localStorage keys `mm_<table>`). Both adapters expose the same `list/create/update/remove(table, ...)` interface; all UI code goes through `DB` and must not care which one is active. App settings (hall name, currency) are always in localStorage (`mm_settings`), even in server mode.

**Generic REST API.** `server.js` exposes one CRUD shape for every table in `TABLES` (`bookings, payments, staff, salaries, expenses, assets`): `GET/POST /api/:t`, `PUT/DELETE /api/:t/:id`. The only per-table logic is the bookings double-booking check in POST/PUT (409 when the same `hall` + `date` + `shift` is taken; PUT merges the existing row first, so partial updates are checked too). Writable columns are discovered from `information_schema` and cached per process, so the request body is filtered to real columns (that allowlist is what makes the interpolated table/column names safe). Restart the server after adding a column. Responses are normalised to strings: `id` becomes a string, NULL becomes `''`, DATE stays `YYYY-MM-DD` (a `pg` type parser prevents time zone day-shifts). Incoming `''` becomes NULL.

**Auth.** Single shared password, no user accounts. Sessions are stateless HMAC-signed `expiry.signature` tokens in an HttpOnly `mm_session` cookie (30 days), so they survive restarts; changing `APP_PASSWORD` invalidates them. Login is rate limited in memory per IP (5 failures, 5 minute lockout). Only `/` and `/index.html` are public; everything under `/api` except login/logout/session requires a valid cookie.

**Config-driven UI.** The `MODULES` object in `index.html` defines each table's form `fields` (key, label, type such as `choice`/`date`/`number`/`textarea`/`staff`/`booking`, `req`, `def`, `opts`; plus `{section}` headings and raw `{html}` entries), table `cols` (with optional render function `f`), `filters`, `sort`, and optional hooks: `enrich(rows)` adds computed fields before filtering (e.g. `_bal`, `status`), `prep(row)` before editing, `beforeSave(data)`, `validate(data, rowId)` returning an error string, `summary(rows)`, `rowActions(r)`, and `dateFilter` (label for a From/To range on the `date` column). Forms, list tables, and filtering are generated from it. `PAGES` drives navigation.

**Booking money.** Bill = `total` (package) + `extra_charges`. Received = `advance` + sum of `payments` rows for that booking. `acct()` and `paidMap()` compute this and every page uses them. The per-row Payment window (`openPayment`) records extra guests on the event day (auto-priced at `per_head`) and a payment, without editing the booking itself. Dashboard and Reports are computed client-side from `loadAll()` via `monthTotals()`: income is the bill, net = income − salaries − expenses for the month (matched by the `date` column's `YYYY-MM`).

**Double booking** is enforced twice: `slotClash()` in the browser (live warning in the form, also used by restore and sample data, and the only check in localStorage mode) and `clash()` in `server.js`. Old bookings with no `hall` are never treated as clashing.

**Assets.** `repair_qty` is how many units need repair. `condition` is derived from it on save. Older rows with only `condition` set are treated as the whole quantity needing repair (`repairCount()`). Asset value is not part of Spent or profit.

**Adding a field** means the module's `fields` (and `cols` if shown) in `index.html` plus an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` line in the upgrades section of `schema.sql`. The server runs the whole file on every start, so the Render database upgrades itself on deploy. Never write a non-idempotent statement there. Adding a new table also means adding it to `TABLES` in both `index.html` and `server.js` (bookings must stay before payments, since restore remaps `booking_id`).

**Backup / restore.** Settings has "Download backup" (JSON `{table: rows[]}` of everything) and "Restore backup", which strips `id` and *appends* every row via `DB.create`, so restoring twice duplicates data. The files in `data/` use this format and are real client import data (names, phone numbers), not fixtures.

## Deployment

The app is hosted on Render and auto-deploys from `main` on GitHub (`origin`, HUR-ALI-110/marquee-manager). Pushing to `main` ships straight to the live client app, so treat every push as a production release. There is no `render.yaml`; build/start commands (`npm install` / `npm start`) and the `DATABASE_URL` / `APP_PASSWORD` env vars are configured in the Render dashboard. `schema.sql` runs on every start, so idempotent upgrades in it (`ADD COLUMN IF NOT EXISTS`) apply automatically on deploy; a statement that fails there stops the server from starting.

## Gotchas

- The ignore file is named `gitignore`, not `.gitignore`, so git ignores nothing. It lists `data/*.json` backups and `.env` as meant to be ignored, yet `data/client-data-backup.json` and `data/optional-setup-costs-2025.json` are committed.
- Numeric fields come back from the API as strings (`"5000.00"`); always go through `num()` before arithmetic.
- Use `today()` / `isoDate()` for dates. They are local time; `toISOString()` is UTC and gives yesterday in Pakistan before 5am.

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

**Generic REST API.** `server.js` exposes one CRUD shape for every table in `TABLES` (`categories, bookings, payments, staff, salaries, expenses, assets`): `GET/POST /api/:t`, `PUT/DELETE /api/:t/:id`. The only per-table logic is the bookings double-booking check in POST/PUT (409 when the same `hall` + `date` + `shift` is taken; PUT merges the existing row first, so partial updates are checked too). Writable columns are discovered from `information_schema` and cached per process, so the request body is filtered to real columns (that allowlist is what makes the interpolated table/column names safe). Restart the server after adding a column. Responses are normalised to strings: `id` becomes a string, NULL becomes `''`, DATE stays `YYYY-MM-DD` (a `pg` type parser prevents time zone day-shifts). Incoming `''` becomes NULL.

**Auth.** Single shared password, no user accounts. Sessions are stateless HMAC-signed `expiry.signature` tokens in an HttpOnly `mm_session` cookie (30 days), so they survive restarts; changing `APP_PASSWORD` invalidates them. Login is rate limited in memory per IP (5 failures, 5 minute lockout). Only `/` and `/index.html` are public; everything under `/api` except login/logout/session requires a valid cookie.

**Config-driven UI.** The `MODULES` object in `index.html` defines each table's form `fields` (key, label, type such as `choice`/`date`/`number`/`textarea`/`staff`/`booking`, `req`, `def`, `opts`; plus `{section}` headings and raw `{html}` entries), table `cols` (with optional render function `f`), `filters`, `sort`, and optional hooks: `enrich(rows)` adds computed fields before filtering (e.g. `_bal`, `status`), `prep(row)` (may be async) before editing, `beforeSave(data)`, `validate(data, rowId)` returning an error string, `afterSave(rawFormData, savedRow, isNew)`, `afterDelete(id)`, `deleteNote`, `summary(rows)`, `rowActions(r)`, `viewExtra(row)` / `viewActions(row)`, and `dateFilter` (label for a From/To range on `dateKey`, default `date`; such lists are sorted by that date with a Newest/Oldest switch instead of `sort`). Field types: text/number/date/month/tel, `choice` (radio pills), `select`, `staff` and `booking` (all rendered by `combo()`: a searchable dropdown backed by a hidden input, `addNew` lets the user type a new value), `check` (checkbox; not stored unless the module keeps it), `textarea`. List filters with more than 8 options also use `combo()`; shorter ones are native `<select>`s styled by the global `select` rule. Required combos are checked in the form's submit handler, since the browser ignores `required` on hidden inputs. Forms, list tables, and filtering are generated from it. `PAGES` drives navigation.

**Booking money.** Bill = `total` (package) + `extra_charges`. Received = `advance` + sum of `payments` rows for that booking. `acct()` and `paidMap()` compute this and every page uses them; `acct()` also returns `waiters` (`waiter_cost`, paid on the event day out of the bill), `donation` (`donation_pct` % of the bill, defaulting to Settings `donation_pct` via `donationPct()`) and `keep` = bill − waiters − donation. The booking form edits every extras field too (`beforeSave` recomputes `extra_charges`; `prep` fills the effective donation % and default AC rate). `extra_charges` is the stored sum of its breakdown, computed by `extras()`: `extra_guests × guestRate(b)` (`extra_rate`, else `per_head`) + `ac_units × ac_rate` + `other_charges` (older rows may have `extra_charges` with no breakdown; the Payment window shows the unexplained part as "other"). The per-row Payment window (`openPayment`) records those extras on the event day and a payment, without editing the booking itself. Settings holds a default `ac_rate`. Dashboard and Reports are computed client-side from `loadAll()` via `rangeTotals(d, from, to)` (`monthTotals()` is a one-month wrapper): income is the bill of events held in the range, `spent` = waiters + donations + salaries + expenses, net = income − spent; `cashIn` is payments dated in the range plus advances of bookings whose `booked_on` is in the range.

**Reports** (`renderReports`) cover one period chosen by `report.kind`: day, month, quarter, half, year or custom range (`periodRange()`); periods longer than a month also get a month-by-month table. Print uses `.printhead`; Excel is a CSV of every section.

**View window.** `openView(id, rowId)` renders a module's fields read-only as label/value rows grouped by `{section}`; `viewHead(row)` returns `{title, meta, big:{label,value,tag}, skip:[fields]}` for the summary strip, and `viewExtra(row)` / `viewActions(row)` add module-specific HTML (bookings: bill ledger and payments; assets: value and the linked expense). Field type `number` is money unless the field has `count:true`.

**Double booking** is enforced twice: `slotClash()` in the browser (live warning in the form, also used by restore and sample data, and the only check in localStorage mode) and `clash()` in `server.js`. Old bookings with no `hall` are never treated as clashing.

**Categories.** Asset categories are `ASSET_CATS` (built in) plus rows of the `categories` table with `kind = 'asset'`; `assetCats()` merges them for the form dropdown and the list filter (`opts` may be an async function). The asset form's category combo has `addNew`, so a typed name becomes the value; `validate` saves it through `addCategory()`. Settings lists and removes custom ones.

**Modal windows.** `showModal()` / `closeForm()` and `confirmBox()` toggle `body.locked` so the page behind cannot scroll. The Payments module is `hidden:true` (no menu entry; reached through the Payment button and reports).

**Assets.** Every purchase is its own row (same item bought twice = two rows, sorted by `purchased` desc). `repair_qty` is how many units need repair. `condition` is derived from it on save. Older rows with only `condition` set are treated as the whole quantity needing repair (`repairCount()`). Asset value itself is not part of Spent; instead the form's "Count this purchase in Expenses" box (`add_expense`, not a column) makes `afterSave` keep exactly one expense with `category = 'Asset purchase'` and `expenses.asset_id = asset.id` in step with the asset (qty × price on the purchase date), and `afterDelete` removes it. Reports show that category as "Asset purchases" and list the assets bought in the period. Restore remaps `asset_id` like `booking_id`, so `assets` must stay before `expenses` in `TABLES`.

**Adding a field** means the module's `fields` (and `cols` if shown) in `index.html` plus an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` line in the upgrades section of `schema.sql`. The server runs the whole file on every start, so the Render database upgrades itself on deploy. Never write a non-idempotent statement there. Adding a new table also means adding it to `TABLES` in both `index.html` and `server.js` (bookings must stay before payments, since restore remaps `booking_id`).

**Backup / restore.** Settings has "Download backup" (JSON `{table: rows[]}` of everything) and "Restore backup", which strips `id` and *appends* every row via `DB.create`, so restoring twice duplicates data. The files in `data/` use this format and are real client import data (names, phone numbers), not fixtures.

## Deployment

The app is hosted on Render and auto-deploys from `main` on GitHub (`origin`, MohZaibAli/marquee-manager; the older HUR-ALI-110/marquee-manager copy is no longer connected). Pushing to `main` ships straight to the live client app, so treat every push as a production release. There is no `render.yaml`; build/start commands (`npm install` / `npm start`) and the `DATABASE_URL` / `APP_PASSWORD` env vars are configured in the Render dashboard. `schema.sql` runs on every start, so idempotent upgrades in it (`ADD COLUMN IF NOT EXISTS`) apply automatically on deploy; a statement that fails there stops the server from starting.

## Gotchas

- The ignore file is named `gitignore`, not `.gitignore`, so git ignores nothing. It lists `data/*.json` backups and `.env` as meant to be ignored, yet `data/client-data-backup.json` and `data/optional-setup-costs-2025.json` are committed.
- Numeric fields come back from the API as strings (`"5000.00"`); always go through `num()` before arithmetic.
- Use `today()` / `isoDate()` for dates. They are local time; `toISOString()` is UTC and gives yesterday in Pakistan before 5am.

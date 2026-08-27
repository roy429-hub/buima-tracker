# plan.md — Buima Tracker

Status reconstructed from git history after the Claude Code session crash.
**Last commit: `b71105d` — 2026-06-14.** Working tree clean, `main` in sync with `origin/main`,
`npm run build` passes.

---

## Phase 1 — Frontend prototype ✅ shipped

- [x] Vite + React + Tailwind scaffold, brand theme (`#be123c`)
- [x] EV charger xlsx parser with Modbus High/Low decoding (`parseXLSX.js`)
- [x] Session detection by status transition + kWh counter reset — verified against
      2026-04-09 (5 sessions) and 2026-05-06 (3 sessions)
- [x] War Room: world map (react-leaflet), portfolio KPIs, per-site table
- [x] Sites page: add / edit / delete installations
- [x] Site Dashboard: KPIs, daily/weekly/monthly/yearly charts, upload, sessions log
- [x] Multi-currency support with hardcoded FX table (`fx.js`)
- [x] Address → lat/lng geocoding via OSM Nominatim

## Phase 2 — Supabase backend ✅ shipped

- [x] Postgres schema `db/init.sql` — `sites` + `uploads`, RLS on both tables
- [x] Email/password auth, `AuthProvider` + `ProtectedRoute`
- [x] localStorage → Supabase migration, with the sync-read cache in `lib/storage.js`
- [x] Public read-only share links via `security definer` RPCs (`db/share_links.sql`)
- [x] Deployed to Vercel as `buima-tracker`, SPA rewrite in `vercel.json`

## Phase 3 — Investor / fund-grade reporting ✅ shipped

- [x] ETF-style War Room layout with subtle KPI cards
- [x] Contract Years field + payback-vs-contract risk flag
- [x] Annualized ROI, payback period (years primary, months parenthetical)
- [x] Monthly average revenue / profit run-rates
- [x] Portfolio Energy & Profit Trend chart (USD-normalized across sites)
- [x] Partner Statement PDF + Investor Monthly Report PDF (`pdfReport.js`)
- [x] Partner contact + profit-split fields (migration `005`)
- [x] Gap-filled time series — missing days render as zero bars
- [x] Copy-pasteable `ALTER TABLE` hints when a save fails on a missing column
- [x] Modal no longer closes on stray field interactions
- [x] Live UTC clock

## Phase 4 — Portfolio controls ✅ shipped

- [x] Per-site ON/OFF toggle that excludes a site from portfolio totals (optimistic + rollback)
- [x] Right-side panels respect the ON/OFF toggle
- [x] Global timeframe filter (All / 7d / 30d / 90d / 6mo / YTD) on War Room + Site Dashboard
- [x] Custom date range with start/end pickers
- [x] Map auto-fit to markers, fills available column height
- [x] Chart tooltip pinned to top as a horizontal pill
- [x] Demo data seed SQL (`db/seed_demo_data.sql`) — **never run against production**

## Phase 5 — ESS (B.E.S.T battery) sites ✅ shipped

- [x] `site_type` discriminator: `'ev'` (default) | `'ess'`
- [x] ESS control-box xlsx parser (`parseEssXlsx.js`) — PV / grid / charge / discharge / SoC / SoH / cycles
- [x] `detectXlsxKind()` header sniffing so one dropzone handles both file types
- [x] `EssSiteDashboard` energy-flow view (no revenue / ROI / payback)
- [x] ESS sites excluded from portfolio financial totals, included in kWh + sessions
- [x] Emerald-green ESS markers on the War Room map
- [x] Two Ecuador ESS sites configured
- [x] Migration file for `site_type` + `ess_summary` (`006_add_site_type_ess_summary.sql`)
- [x] ESS site type selectable in `SiteForm`
- [x] `UploadDropzone` success card handles the ESS result shape

## Phase 6 — Map outage fix + hardening ✅ shipped (2026-08-27)

- [x] **Fixed: the War Room map disappearing.** Leaflet's stylesheet was fetched from unpkg
      at runtime via `@import` and was never bundled. Whenever that request failed —
      CDN outage, corporate proxy, ad-blocker, DNS — `.leaflet-pane` and `.leaflet-tile`
      dropped from `position: absolute` to `static` and Tailwind preflight capped tiles at
      `max-width: 100%`, collapsing every tile into normal document flow. Now bundled from
      `node_modules`; the build contains zero unpkg references.
- [x] Leaflet marker PNGs imported as assets (Vite inlines all three as data URIs)
- [x] `SiteDashboard`: moved `useState` above the early returns — flipping a site's type
      while viewing it would have crashed React ("rendered fewer hooks than expected")
- [x] `006` migration drops functions before recreating them, since Postgres refuses a
      `create or replace` that changes a `RETURNS TABLE` signature
- [x] `site_type` added to the missing-column SQL hint in `SiteForm`
- [x] Version string unified in `src/lib/version.js` (footer said v0.1, login said v0.2)

---

## Next up — recommended order

### 1. Run migration `006` against Supabase 🔴 do this first

`db/migrations/006_add_site_type_ess_summary.sql` is written but **not yet applied**. It is
additive and idempotent — on the production project the two `add column if not exists`
statements are no-ops, and the value is that it re-declares both share-link functions and
makes `db/` a faithful schema of record again.

Paste it into Supabase → SQL Editor → Run. Nothing in the app depends on it having run
(production already has both columns), so this is safe to do at any time.

### 2. Refresh the FX rates

`FX_LAST_UPDATED` is stamped `2026-05-01` and the rates are hand-maintained. Every
cross-site USD total is derived from them. Either refresh the table and bump the constant, or
promote this to a live FX API and surface a real "rates as of" timestamp.

### 3. Housekeeping

- `README.md` still describes Phase 1 as current ("localStorage seed data", "Phase 2 next").
  It predates Supabase, auth, share links, PDFs, and ESS — rewrite or point it at `CLAUDE.md`.
- Consider code-splitting the ~1.9 MB main chunk (leaflet, recharts, jspdf, xlsx are all
  eagerly imported). Cosmetic — the build warning is currently accepted.

---

## Ground rules

- The Supabase project is **live and provisioned**. Additive migrations only; never rotate
  credentials or drop tables. See `CLAUDE.md` §3.
- `npm run build` must pass clean before ticking a box here. There is no test suite.
- Re-verify the two sample dates in `CLAUDE.md` §5 after any parser change.

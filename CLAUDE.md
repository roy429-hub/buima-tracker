# CLAUDE.md — Buima Tracker

> Context file for Claude Code. The original session history for this project was lost in a
> crash; this file is reconstructed from the source at commit `b71105d` (2026-06-14).

## 1. What this product is

An internal operations + investor-reporting dashboard for **Buima Energy** (桓鼎能源).
Field engineers export daily `.xlsx` history files from EV chargers and B.E.S.T battery
(ESS) control boxes → drag them into the dashboard → the browser parses them, detects
charging sessions, computes revenue / profit / ROI per site, and rolls everything up into a
multi-currency "War Room" portfolio view. Partner statements and investor monthly reports
come out as PDFs.

Single-tenant: every authenticated user is Buima staff and sees **all** sites. There is no
per-user or per-org scoping.

| Surface | Route | Auth |
|---|---|---|
| **Login** | `/login` | public |
| **War Room** — global map, portfolio KPIs, site table | `/` | required |
| **Installations** — add/edit/delete sites | `/sites` | required |
| **Site Dashboard** — per-site KPIs, charts, upload, sessions | `/sites/:id` | required |
| **Share View** — read-only client view of one site | `/share/:token` | **public, token-scoped** |

Deployed on Vercel as project `buima-tracker` → https://buima-tracker.vercel.app
`vercel.json` rewrites all paths to `/` — required for client-side routing.

## 2. Stack

- **Vite 8** + **React 19** (`.jsx`, **plain JavaScript — no TypeScript**)
- **react-router-dom 7** (`BrowserRouter`)
- **Tailwind CSS 3** — brand color `#be123c` exposed as `brand` / `brand-dark` / `brand-light`
- **Supabase** — Postgres + Auth (email/password) + RLS
- **recharts** charts · **react-leaflet** + OSM tiles map · **lucide-react** icons
- **xlsx** (SheetJS) parsing · **jspdf** + **jspdf-autotable** PDF reports
- ESLint flat config; `npm run lint`

## 3. Supabase — DO NOT BREAK THIS

**The Supabase project is live and already provisioned. Never regenerate, rotate, or
overwrite credentials, and never drop or recreate tables.** Migrations are additive only.

- Credentials live in `.env.local` (gitignored — `.env*` is in `.gitignore`) and in the
  Vercel project env vars. Both must stay in sync.
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Only the **anon** key is ever used. There is no service-role key in this app and none
  should be added — it would ship to the browser.
- Auth is email/password only. Staff accounts are created by hand in Supabase →
  Authentication → Users. There is no signup screen, and there should not be one.

### Schema of record

`db/init.sql` is the base schema, then `db/migrations/*.sql` in numeric order. Every file is
written to be **idempotent and re-runnable**. They are applied by hand in the Supabase SQL
Editor — there is no migration runner.

- `sites` — one row per installation. Financial params (`capex`, `opex_monthly`,
  `charging_fee`, `cost_per_kwh`, `contract_years`, `currency`), partner split
  (`partner_name`, `partner_email`, `buima_split_pct`, `partner_split_pct`), location
  (`lat` / `lng` / `address`), `active` flag, and a unique `share_token`.
- `uploads` — one row per **site per day**, `unique(site_id, report_date)`. Parsed session
  detail is stored in the `sessions` jsonb column; ESS day summaries in `ess_summary` jsonb.
  Re-uploading a date **overwrites** it (upsert on `onConflict: "site_id,report_date"`).

RLS is on for both tables. One policy per table: `authenticated` can do everything, `anon`
gets nothing. Public share links deliberately bypass this through three `security definer`
functions in `db/share_links.sql`:

- `get_site_by_share_token(token)` — granted to `anon` + `authenticated`
- `get_uploads_by_share_token(token)` — granted to `anon` + `authenticated`
- `regenerate_share_token(site_id)` — **`authenticated` only**, explicitly revoked from `anon`

⚠️ Migrations `003`, `004`, and `005` each `create or replace` the
`get_site_by_share_token` return signature. **Any migration that adds a column the share
view needs must re-declare that whole function**, or anonymous share links silently lose the
field. Follow the pattern in `005_add_partner_split.sql`.

## 4. Architecture

```
src/
  main.jsx                    # React root
  App.jsx                     # AuthProvider → BrowserRouter → routes
  lib/
    supabase.js               # client + ALL db access + snake_case↔camelCase mapping
    auth.jsx                  # AuthProvider, useAuth, signIn, signOut
    storage.js                # in-memory cache + pub/sub  ← read before touching data flow
    useStorage.js             # useStorageVersion() hook
    aggregate.js              # all financial math
    fx.js                     # hardcoded FX rates + formatters
    parseXLSX.js              # EV charger xlsx → sessions
    parseEssXlsx.js           # ESS control-box xlsx → day summary (+ detectXlsxKind)
    pdfReport.js              # partner statement + investor monthly PDFs
    geocode.js                # OSM Nominatim address → lat/lng
  components/                 # Layout, ProtectedRoute, SiteForm, UploadDropzone, …
  pages/                      # WarRoom, Sites, SiteDashboard, EssSiteDashboard,
                              # Login, ShareSiteView
db/                           # init.sql + share_links.sql + migrations/
```

### The storage cache — the one pattern you must not fight

`lib/storage.js` is a **module-level cache with synchronous reads and async writes**. This is
deliberate: `aggregate.js` and every page read data synchronously during render.

- `ProtectedRoute` calls `refreshFromDB()` once after login to prime the cache.
- Reads are sync: `getSites()`, `getSite(id)`, `getUploads()`, `getUploadsForSite(id)`.
- Writes are async, update the cache, then `notify()` all subscribers.
- Components call `useStorageVersion()` to re-render on any cache change.

Rules:

- **Never fetch Supabase directly from a component.** Go through `lib/storage.js`, which goes
  through `lib/supabase.js`.
- **All DB access lives in `lib/supabase.js`.** It owns the snake_case ↔ camelCase mapping in
  both directions (`siteFromDB` / `siteToDB`, `uploadFromDB` / `uploadToDB`). Adding a column
  means editing *both* mappers.
- `toggleSiteActive` updates optimistically and **rolls back on failure** — keep that shape
  for any new optimistic mutation.
- Use `??` (not `||`) for numeric site fields. Sites legitimately have `capex = 0`
  (undisclosed / NDA) and `contract_years = 0` (no formal contract); `||` would silently
  replace those with defaults. This was a real bug — see commit `77eef34`.

## 5. Domain logic

### EV session detection (`parseXLSX.js`) — verified, do not "improve" casually

The charger exports a 45-column, 5-minute-interval sheet. Values arrive as **Modbus
High/Low 16-bit register pairs**: `combine(h, l) = h * 65536 + l`, then `/1000` for kW / kWh.
Guns C1 and C2 are scanned independently and merged.

A session is open while status is `8` or `10`. It closes when status leaves that set, **or**
when the kWh counter resets mid-session (`prevKwh > 5 && kwh < prevKwh - 5`) — that reset is
a new car on the same gun, which is why a plain status-transition parser undercounts.

Verified against real files: **2026-04-09 → 5 sessions** (1×C1, 4×C2), **2026-05-06 →
3 sessions** (all C2). If you change this logic, re-verify against those two dates.

The report date is the **dominant calendar date** across rows (files straddle midnight), not
the first row's date.

### ESS parsing (`parseEssXlsx.js`)

Same Modbus High/Low convention, different column map, plus `signed16()` for power registers.
Daily flows prefer the firmware's direct daily counters when non-zero and fall back to
cumulative end-minus-start deltas. SoC and SoH are stored ×10.

`detectXlsxKind(headerRow)` sniffs the header to return `"ev" | "ess" | null`, and
`UploadDropzone` dispatches to the right parser — one dropzone handles both file types.

### Financial model (`aggregate.js`)

```
revenue      = kWh × charging_fee
variableCost = kWh × cost_per_kwh
fixedOpex    = opex_monthly / 30.4375  (per day of data)
netProfit    = revenue − variableCost − fixedOpex        ← the headline number
roi          = netProfit / capex × 100                   (cumulative, no split applied)
annualized   = (netProfit / days) × 365
payback      = capex / annualizedProfit                  (years primary, months in parens)
```

- `30.4375` = average days per month. Used consistently; don't swap in 30.
- **ROI headline is cumulative, subtext is annualized** (commits `d4efde6`, `c8e0350`). It has
  been flipped twice — check git log before flipping it again.
- Profit splits affect **partner statements only**, never dashboard ROI.
- Cross-site totals convert to USD per site *before* summing, via `toUSD(amount, currency)`.
- **ESS sites contribute kWh and sessions to portfolio totals but never revenue, CAPEX, or
  ROI** — they have no charging revenue. See the `isEss` branch in `aggregateAllSites`.
- Chart series are **gap-filled** (`fillDaily` / `Weekly` / `Monthly` / `Yearly`) so missing
  days render as zero bars across the whole selected timeframe rather than collapsing the axis.

### FX (`fx.js`)

Rates are **hardcoded** and manually maintained, last stamped
`FX_LAST_UPDATED = "2026-05-01"`. Bump that constant whenever you edit a rate — the War Room
displays it. Unknown currency codes pass through unconverted.

## 6. UI conventions

- **App shell is dark** (`bg-slate-950`) with a **white header and footer**. Modals and PDFs
  are light. `UploadDropzone` takes a `theme="dark" | "light"` prop for this reason.
- Brand accent `text-brand` / `bg-brand` on section eyebrows, active nav, primary buttons.
- Labels are `text-[10px] uppercase tracking-wider font-bold`; numbers are `font-mono` /
  `tabular-nums`. Metric values use `font-black`.
- Times display in **UTC** everywhere (`LiveClock`) — global ops, region-agnostic.
- Modals close only when mousedown **and** click both land on the backdrop
  (`mouseDownOnBackdrop` ref). This stops number-spinner drags from nuking a filled form —
  copy the pattern for any new modal (commit `4f2c87d`).
- Save errors that look like a missing column render **copy-pasteable `ALTER TABLE` SQL** in
  the error box (`SiteForm.jsx`). Extend that mapping when adding columns.
- Chart tooltips pin to the top of the chart as a horizontal pill so they never cover bars.

## 7. Verification loop

```bash
npm run build
```

Must pass clean. There is **no test suite and no TypeScript**, so the build plus a manual
click-through is the whole safety net — be conservative in `aggregate.js` and the parsers.
The ~1.9 MB main chunk warning is known and accepted (leaflet + recharts + jspdf + xlsx).

To verify parser changes, re-parse the two sample files kept one level up in
`Buima Tracker/` (`EV Charger History (95).xlsx` and the 5-min-interval export) and check the
session counts in §5.

## 8. Known gaps / traps

1. **Never load Leaflet's CSS or images from a CDN.** They are bundled from `node_modules`
   (`@import 'leaflet/dist/leaflet.css'` in `index.css`, and the marker PNGs imported as
   assets in `WarRoom.jsx`). This is not a preference — it is a past outage. When that CSS
   came from unpkg, any blocked request dropped `.leaflet-pane` / `.leaflet-tile` from
   `position: absolute` to `static` and let Tailwind preflight cap tiles at
   `max-width: 100%`, which destroys the map completely. Verify after touching map code:

   ```bash
   npm run build && grep -rl unpkg dist/ ; grep -c "leaflet-pane" dist/assets/*.css
   ```

   Expect no unpkg hits and a non-zero leaflet-pane count.
2. **The basemap must stay key-free.** Tiles come from **Esri Dark Gray Canvas**
   (`server.arcgisonline.com/.../World_Dark_Gray_Base` + `..._Reference` stacked for labels)
   — free, no API key, no quota. It replaced CARTO, which now stamps
   "API KEY REQUIRED" diagonally across every tile served without a key. Esri's path is
   **`{z}/{y}/{x}` — row before column**, unlike the `{z}/{x}/{y}` most providers use; get
   it backwards and the map loads happily while showing the wrong part of the world. To
   sanity-check ordering, compare labels-tile sizes: at z4 Europe (`/4/5/8`) is ~12.6 kB
   while mid-Pacific (`/4/8/1`) is ~0.9 kB.
3. **Changing a `RETURNS TABLE` signature needs `drop function` first.** Postgres refuses
   `create or replace` when the return type changes ("cannot change return type of existing
   function"). Migrations `003`–`005` omit the drop and will error on a database where the
   function already exists; `006` shows the correct pattern.
4. **Hooks must stay above the early returns in `SiteDashboard`.** It returns early for
   "site not found" and for ESS sites, so any hook declared below those returns changes the
   hook count between renders and React throws "rendered fewer hooks than expected". This is
   live now that site type is editable and can flip while the page is mounted.
5. **Migration `003` dropped the partner columns and `005` re-added them.** Don't read `003`
   as current intent.
6. Geocoding is OSM Nominatim — free, rate-limited to ~1 req/sec, no key. Don't batch it.
7. **Google Fonts is still loaded from a CDN** (`index.css` line 1). Unlike Leaflet this
   degrades gracefully — type falls back to Inter / system-ui — so it is not a functional
   risk. Self-host via `@fontsource/dm-sans` + `@fontsource/dm-mono` if the dashboard ever
   needs to run fully offline.
8. `db/seed_demo_data.sql` inserts fake sites and six months of fake uploads. **Never run it
   against the production project.**
9. `npm run lint` reports 19 pre-existing errors (unused imports, `exhaustive-deps`). That is
   the baseline, not something you introduced — compare before and after your change rather
   than aiming for zero.

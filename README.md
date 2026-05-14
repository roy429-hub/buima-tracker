# Buima Tracker — Phase 1 (frontend prototype)

Online dashboard for tracking Buima Energy's global EV-charging installations.
Engineers upload daily xlsx reports → the dashboard auto-parses them, computes revenue / profit / KPIs per site, and aggregates across all sites in a War Room map view.

## Run locally

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # production build → dist/
```

## Pages

| Route | Purpose |
|---|---|
| `/` | **War Room** — global map + KPIs + per-site table |
| `/sites` | **Sites** — add / edit / delete installation sites |
| `/sites/:id` | **Site Dashboard** — KPIs, daily/weekly/monthly/yearly charts, xlsx upload, sessions log |

## Session Detection Logic (verified)

The parser in `src/lib/parseXLSX.js` decodes the 45-column 5-min interval xlsx, combines High/Low 32-bit Modbus registers (÷1000 for kW/kWh), and detects sessions by status transition + kWh counter reset.

Verified against real data:
- **April 9, 2026** → 5 sessions (1 on C1, 4 on C2) ✅
- **May 6, 2026** → 3 sessions (all C2) ✅

## Seed Data

On first load, three sites are seeded: **Duiven (Netherlands)** real site, plus **Taipei** + **Tokyo** placeholders. Delete them from the Sites page if not needed.

## Phase 2 (next)

- Migrate localStorage → **Supabase** (DB + Storage + Auth)
- Add **client share links** for read-only views
- Deploy to **Vercel**
- Hook in the **Traditional-Chinese PDF report** generator

-- Buima Tracker — Migration 006: ESS site type + ESS daily summary
--
-- These two columns were added to the LIVE database during the June 2026 ESS work
-- but never captured in a migration file, so db/ stopped being a faithful schema of
-- record. This file backfills that gap. It is additive and idempotent: running it
-- against the production project is a no-op if the columns already exist.
--
-- Run in Supabase Dashboard → SQL Editor → new query → paste → Run. Safe to re-run.

-- =============================================================
-- 1) Columns
-- =============================================================
-- sites.site_type: 'ev' (default) | 'ess'
--   'ev'  → SiteDashboard, parsed by parseXLSX.js, contributes revenue/CAPEX/ROI
--   'ess' → EssSiteDashboard, parsed by parseEssXlsx.js, contributes energy only
alter table public.sites add column if not exists site_type text default 'ev';

-- uploads.ess_summary: per-day ESS rollup produced by parseEssXlsx.js
--   { pvKwh, gridKwh, chargedKwh, dischargedKwh, peakSoc, minSoc, avgSoc,
--     pvPeakW, gridPeakW, cyclesEnd, cyclesDelta, soh, samplesCount, trace[] }
alter table public.uploads add column if not exists ess_summary jsonb;

-- Backfill any pre-existing rows that predate the column default.
update public.sites set site_type = 'ev' where site_type is null;

-- Guard against typos writing an unrecognised type. Added separately so the
-- statement above stays valid on a database where the column already existed.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sites_site_type_check'
  ) then
    alter table public.sites
      add constraint sites_site_type_check check (site_type in ('ev', 'ess'));
  end if;
end
$$;

-- =============================================================
-- 2) Refresh the share-link reader
-- =============================================================
-- Any migration that adds a column the public share view needs must re-declare
-- this whole function, otherwise anonymous share links silently lose the field.
-- Signature below = migration 005 + site_type.
--
-- NOTE: adding a column to a RETURNS TABLE signature changes the function's
-- return type, and Postgres refuses that under `create or replace`
-- ("cannot change return type of existing function"). It must be dropped first.
-- Migrations 003–005 omitted this and will error on a database where the
-- function already exists; do not copy that pattern.
drop function if exists public.get_site_by_share_token(text);

create or replace function public.get_site_by_share_token(token text)
returns table (
  id                uuid,
  name              text,
  country           text,
  city              text,
  address           text,
  lat               double precision,
  lng               double precision,
  charger_id        text,
  charging_fee      numeric,
  cost_per_kwh      numeric,
  capex             numeric,
  opex_monthly      numeric,
  contract_years    integer,
  partner_name      text,
  buima_split_pct   numeric,
  partner_split_pct numeric,
  site_type         text,
  currency          text,
  active            boolean
)
language sql
security definer
set search_path = public
as $$
  select id, name, country, city, address, lat, lng, charger_id,
         charging_fee, cost_per_kwh, capex, opex_monthly, contract_years,
         partner_name, buima_split_pct, partner_split_pct,
         site_type, currency, active
    from public.sites
   where share_token = token and active = true
   limit 1;
$$;

grant execute on function public.get_site_by_share_token(text) to anon, authenticated;

-- =============================================================
-- 3) Refresh the share-link uploads reader (needs ess_summary)
-- =============================================================
-- Same return-type rule as above: drop before recreating.
drop function if exists public.get_uploads_by_share_token(text);

create or replace function public.get_uploads_by_share_token(token text)
returns table (
  id              uuid,
  site_id         uuid,
  report_date     date,
  charger_id      text,
  total_kwh       numeric,
  total_sessions  int,
  c1_sessions     int,
  c2_sessions     int,
  sessions        jsonb,
  ess_summary     jsonb,
  uploaded_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select u.id, u.site_id, u.report_date, u.charger_id,
         u.total_kwh, u.total_sessions, u.c1_sessions, u.c2_sessions,
         u.sessions, u.ess_summary, u.uploaded_at
    from public.uploads u
    join public.sites s on s.id = u.site_id
   where s.share_token = token and s.active = true
   order by u.report_date desc;
$$;

grant execute on function public.get_uploads_by_share_token(text) to anon, authenticated;

-- Done!

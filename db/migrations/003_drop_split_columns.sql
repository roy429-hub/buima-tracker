-- Buima Tracker — Migration 003: drop partner / split columns
-- These fields are no longer used by the app.
-- Run this in Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run.

-- 1) Update the share-link reader function FIRST so it doesn't reference
--    the columns we're about to drop.
create or replace function public.get_site_by_share_token(token text)
returns table (
  id              uuid,
  name            text,
  country         text,
  city            text,
  address         text,
  lat             double precision,
  lng             double precision,
  charger_id      text,
  charging_fee    numeric,
  cost_per_kwh    numeric,
  capex           numeric,
  opex_monthly    numeric,
  currency        text,
  active          boolean
)
language sql
security definer
set search_path = public
as $$
  select id, name, country, city, address, lat, lng, charger_id,
         charging_fee, cost_per_kwh, capex, opex_monthly,
         currency, active
    from public.sites
   where share_token = token and active = true
   limit 1;
$$;

grant execute on function public.get_site_by_share_token(text) to anon, authenticated;

-- 2) Drop the columns.
alter table public.sites drop column if exists buima_split_pct;
alter table public.sites drop column if exists partner_split_pct;
alter table public.sites drop column if exists partner_name;

-- Done!

-- Buima Tracker — Migration 005: Partner Statement support
-- Adds partner contact + profit-split % to sites.
-- Run in Supabase Dashboard → SQL Editor → new query → paste → Run.
-- Safe to re-run.

alter table public.sites add column if not exists partner_name      text    default '';
alter table public.sites add column if not exists partner_email     text    default '';
alter table public.sites add column if not exists buima_split_pct   numeric default 100;
alter table public.sites add column if not exists partner_split_pct numeric default 0;

-- Refresh share-link reader to include these columns (read-only safe to expose)
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
  contract_years  integer,
  partner_name    text,
  buima_split_pct numeric,
  partner_split_pct numeric,
  currency        text,
  active          boolean
)
language sql
security definer
set search_path = public
as $$
  select id, name, country, city, address, lat, lng, charger_id,
         charging_fee, cost_per_kwh, capex, opex_monthly, contract_years,
         partner_name, buima_split_pct, partner_split_pct,
         currency, active
    from public.sites
   where share_token = token and active = true
   limit 1;
$$;

grant execute on function public.get_site_by_share_token(text) to anon, authenticated;

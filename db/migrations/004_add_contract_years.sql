-- Buima Tracker — Migration 004: add contract_years
-- Each installation site now declares its contract length so we can show
-- "payback vs contract" risk and compute end-of-contract projected ROI.
-- Safe to re-run.

alter table public.sites add column if not exists contract_years integer default 10;

-- Refresh share-link reader so anon clients see contract_years too
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
  currency        text,
  active          boolean
)
language sql
security definer
set search_path = public
as $$
  select id, name, country, city, address, lat, lng, charger_id,
         charging_fee, cost_per_kwh, capex, opex_monthly, contract_years,
         currency, active
    from public.sites
   where share_token = token and active = true
   limit 1;
$$;

grant execute on function public.get_site_by_share_token(text) to anon, authenticated;

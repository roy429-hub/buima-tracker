-- Buima Tracker — Share Links (Phase 2.1)
-- Run this AFTER init.sql in Supabase Dashboard → SQL Editor.
-- Adds read-only public access to a single site (and its uploads) via share_token.
-- Safe to re-run.

-- =============================================================
-- Function: get_site_by_share_token
-- Returns ONE active site row matching the token. SECURITY DEFINER lets it
-- bypass RLS for this specific lookup. Anonymous users can call it.
-- =============================================================
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
  buima_split_pct numeric,
  partner_split_pct numeric,
  partner_name    text,
  currency        text,
  active          boolean
)
language sql
security definer
set search_path = public
as $$
  select id, name, country, city, address, lat, lng, charger_id,
         charging_fee, cost_per_kwh, capex, opex_monthly,
         buima_split_pct, partner_split_pct, partner_name, currency, active
    from public.sites
   where share_token = token and active = true
   limit 1;
$$;

-- =============================================================
-- Function: get_uploads_by_share_token
-- Returns ALL uploads for the site matching the token.
-- =============================================================
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
  uploaded_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select u.id, u.site_id, u.report_date, u.charger_id,
         u.total_kwh, u.total_sessions, u.c1_sessions, u.c2_sessions,
         u.sessions, u.uploaded_at
    from public.uploads u
    join public.sites s on s.id = u.site_id
   where s.share_token = token and s.active = true
   order by u.report_date desc;
$$;

-- =============================================================
-- Function: regenerate_share_token (authenticated only)
-- =============================================================
create or replace function public.regenerate_share_token(site_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  update public.sites
     set share_token = replace(gen_random_uuid()::text, '-', '')
   where id = site_id
   returning share_token;
$$;

-- =============================================================
-- Permissions
-- =============================================================
-- Anonymous (no login) can read a site via token, can NOT regenerate it
grant execute on function public.get_site_by_share_token(text) to anon, authenticated;
grant execute on function public.get_uploads_by_share_token(text) to anon, authenticated;

-- Only authenticated (Buima staff) can regenerate tokens
revoke execute on function public.regenerate_share_token(uuid) from anon, public;
grant execute on function public.regenerate_share_token(uuid) to authenticated;

-- Done!

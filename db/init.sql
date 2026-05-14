-- Buima Tracker — Initial Schema
-- Run this in Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe to re-run (idempotent).

-- =============================================================
-- Tables
-- =============================================================

create table if not exists public.sites (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  country           text default '',
  city              text default '',
  address           text default '',
  lat               double precision default 0,
  lng               double precision default 0,
  charger_id        text default '',
  charging_fee      numeric default 0,
  cost_per_kwh      numeric default 0,
  capex             numeric default 0,
  opex_monthly      numeric default 0,
  buima_split_pct   numeric default 100,
  partner_split_pct numeric default 0,
  partner_name      text default '',
  currency          text default 'USD',
  active            boolean default true,
  share_token       text unique default replace(gen_random_uuid()::text, '-', ''),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists public.uploads (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites(id) on delete cascade,
  report_date     date not null,
  charger_id      text default '',
  total_kwh       numeric default 0,
  total_sessions  int default 0,
  c1_sessions     int default 0,
  c2_sessions     int default 0,
  sessions        jsonb default '[]'::jsonb,
  uploaded_at     timestamptz default now(),
  unique(site_id, report_date)
);

create index if not exists idx_uploads_site_date on public.uploads(site_id, report_date desc);

-- =============================================================
-- updated_at trigger for sites
-- =============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_sites_updated on public.sites;
create trigger trg_sites_updated before update on public.sites
  for each row execute function public.set_updated_at();

-- =============================================================
-- Row Level Security
-- =============================================================
-- Authenticated users (Buima staff) can do everything.
-- Anonymous users (no login) get NO access — share-link feature can be added later.
-- =============================================================

alter table public.sites   enable row level security;
alter table public.uploads enable row level security;

-- Drop any prior policies (so this script is idempotent)
drop policy if exists "sites_authenticated_all" on public.sites;
drop policy if exists "uploads_authenticated_all" on public.uploads;

create policy "sites_authenticated_all" on public.sites
  for all to authenticated using (true) with check (true);

create policy "uploads_authenticated_all" on public.uploads
  for all to authenticated using (true) with check (true);

-- =============================================================
-- Seed data (only inserts if sites table is empty)
-- =============================================================
insert into public.sites
  (name, country, city, address, lat, lng, charger_id,
   charging_fee, cost_per_kwh, capex, opex_monthly,
   buima_split_pct, partner_split_pct, partner_name, currency)
select * from (values
  ('Restaurant Nieuwe Tijd — Duiven', 'Netherlands', 'Duiven',
   'Roggekamp 4, 6921 RC Duiven, Netherlands', 51.9477, 6.0214, 'ffa388af-cfa2-4a',
   0.67, 0.21, 45000, 250, 70, 30, 'Zemovi (CPO)', 'EUR'),
  ('Buima HQ Demo — Taipei', 'Taiwan', 'Taipei',
   'Taipei 101, Xinyi District, Taipei, Taiwan', 25.0330, 121.5654, 'demo-taipei-01',
   9.5, 3.5, 1400000, 8000, 100, 0, '', 'TWD'),
  ('Tokyo Pilot — Shibuya', 'Japan', 'Tokyo',
   'Shibuya Crossing, Shibuya City, Tokyo, Japan', 35.6595, 139.7004, 'demo-tokyo-01',
   45, 22, 6000000, 35000, 60, 40, 'Local JV partner', 'JPY')
) as v
where not exists (select 1 from public.sites);

-- Done!
-- =============================================================
-- After running, go to: Authentication → Users → Add user
-- Create your Buima staff account (email + password) so you can log in.

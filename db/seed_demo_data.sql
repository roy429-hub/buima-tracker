-- =================================================================
-- BUIMA TRACKER — Demo Data Seed (Phase 2.5)
-- =================================================================
-- Inserts 5 new demo sites (TW × 3 + JP × 2) and generates ~6 months
-- of realistic-looking daily uploads for ALL demo sites (Tokyo, Taipei,
-- and the 5 new ones).
--
-- ⚠ Explicitly EXCLUDES the Netherlands (Duiven) site — it stays
-- untouched, only updated by daily xlsx uploads.
--
-- Pattern:
--   • 6 months back-dated (CURRENT_DATE − 180 → CURRENT_DATE)
--   • Each site has its own base utilization profile
--   • Ramp factor 0.5 → 1.0 over the period (snowball effect)
--   • ~15% zero-utilization days mixed in for realism
--   • Nikko gets weekend boost (tourist site)
--   • Sessions split between left/right gun roughly evenly
--   • Each session has gun, start, end, kWh, durationMin, peakKw, endSoc
--
-- Safe to re-run: existing demo uploads for each site are wiped
-- first to avoid duplicates. New sites are skipped if they already
-- exist (ON CONFLICT by name).
-- =================================================================

-- ──────────────────────────────────────────────────────────────
-- 1) Add 5 new demo sites
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.sites
  (name, country, city, address, lat, lng, charger_id,
   charging_fee, cost_per_kwh, capex, opex_monthly, contract_years,
   currency, active)
SELECT * FROM (VALUES
  ('Kaohsiung Port — Pier 7', 'Taiwan', 'Kaohsiung',
   'Gushan District, Kaohsiung, Taiwan',
   22.6175::double precision, 120.2802::double precision, 'demo-kao-port',
   9.5::numeric, 3.5::numeric, 1450000::numeric, 9000::numeric, 10,
   'TWD', true),
  ('Kaohsiung Mall — Yancheng', 'Taiwan', 'Kaohsiung',
   'Yancheng District, Kaohsiung, Taiwan',
   22.6273::double precision, 120.2818::double precision, 'demo-kao-mall',
   9.5, 3.5, 1380000, 7500, 10, 'TWD', true),
  ('Taichung Hub — Xitun', 'Taiwan', 'Taichung',
   'Xitun District, Taichung, Taiwan',
   24.1648, 120.6440, 'demo-tch-xitun',
   9.5, 3.5, 1320000, 7000, 10, 'TWD', true),
  ('Nikko Resort — Tochigi', 'Japan', 'Nikko',
   'Nikko, Tochigi, Japan',
   36.7195, 139.6985, 'demo-nikko-01',
   45, 22, 5800000, 32000, 10, 'JPY', true),
  ('Kyushu Highway — Fukuoka', 'Japan', 'Fukuoka',
   'Fukuoka City, Kyushu, Japan',
   33.5904, 130.4017, 'demo-kyushu-01',
   45, 22, 6200000, 38000, 10, 'JPY', true)
) AS v(name, country, city, address, lat, lng, charger_id,
       charging_fee, cost_per_kwh, capex, opex_monthly, contract_years,
       currency, active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sites s WHERE s.name = v.name
);

-- ──────────────────────────────────────────────────────────────
-- 2) Generate ~6 months of daily uploads for all DEMO sites
--    (Duiven is excluded by name)
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_site         RECORD;
  v_date         DATE;
  v_start_date   DATE := CURRENT_DATE - 180;
  v_total_days   INT  := 180;
  v_progress     NUMERIC;
  v_ramp         NUMERIC;
  v_base_kwh     NUMERIC;
  v_base_sess    NUMERIC;
  v_kwh          NUMERIC;
  v_sessions_n   INT;
  v_c1           INT;
  v_c2           INT;
  v_minutes      INT;
  v_seed         NUMERIC;
  v_sessions_json JSONB;
  v_dow          INT;
  v_is_weekend   BOOLEAN;
BEGIN
  -- Iterate over demo sites only
  FOR v_site IN
    SELECT id, name, charger_id
      FROM public.sites
     WHERE name NOT ILIKE '%duiven%'
       AND name NOT ILIKE '%nieuwe tijd%'
       AND (
         name ILIKE '%tokyo%' OR name ILIKE '%shibuya%' OR
         name ILIKE '%taipei%' OR
         name ILIKE '%kaohsiung%' OR
         name ILIKE '%taichung%' OR
         name ILIKE '%nikko%' OR
         name ILIKE '%kyushu%' OR name ILIKE '%fukuoka%'
       )
  LOOP
    -- Per-site base utilization profile (typical kWh/day)
    v_base_kwh := CASE
      WHEN v_site.name ILIKE '%tokyo%' OR v_site.name ILIKE '%shibuya%' THEN 65   -- urban, dense
      WHEN v_site.name ILIKE '%taipei%'                                  THEN 55  -- urban
      WHEN v_site.name ILIKE '%kaohsiung%port%'                          THEN 75  -- industrial heavy
      WHEN v_site.name ILIKE '%kaohsiung%mall%'                          THEN 45  -- retail
      WHEN v_site.name ILIKE '%taichung%'                                THEN 40  -- medium urban
      WHEN v_site.name ILIKE '%nikko%'                                   THEN 30  -- tourist (weekend heavy)
      WHEN v_site.name ILIKE '%kyushu%' OR v_site.name ILIKE '%fukuoka%' THEN 60  -- highway
      ELSE 35
    END;

    v_base_sess := v_base_kwh / 22.0; -- ~22 kWh per avg session

    -- Wipe any prior uploads for this demo site (idempotent re-runs)
    DELETE FROM public.uploads WHERE site_id = v_site.id;

    v_date := v_start_date;
    WHILE v_date <= CURRENT_DATE LOOP
      v_progress := (v_date - v_start_date)::numeric / v_total_days;
      -- Snowball ramp: starts at 0.4× base, ends at 1.1× base
      v_ramp := 0.4 + 0.7 * v_progress;

      -- Weekend boost for Nikko (tourist destination)
      v_dow := EXTRACT(DOW FROM v_date)::int;
      v_is_weekend := v_dow = 0 OR v_dow = 6;
      IF v_site.name ILIKE '%nikko%' AND v_is_weekend THEN
        v_ramp := v_ramp * 1.6;
      END IF;
      -- Industrial sites dip on weekends
      IF v_site.name ILIKE '%kaohsiung%port%' AND v_is_weekend THEN
        v_ramp := v_ramp * 0.5;
      END IF;

      v_seed := random();

      -- ~15% chance of zero-utilization day, ~10% of low day
      IF v_seed < 0.15 THEN
        v_kwh := 0;
        v_sessions_n := 0;
        v_c1 := 0; v_c2 := 0; v_minutes := 0;
        v_sessions_json := '[]'::jsonb;
      ELSE
        -- Random variation 0.4× to 1.8× of (base × ramp)
        v_kwh := ROUND(GREATEST(0, v_base_kwh * (0.4 + random() * 1.4) * v_ramp)::numeric, 2);
        v_sessions_n := GREATEST(1, ROUND(v_base_sess * (0.4 + random() * 1.4) * v_ramp)::int);
        v_c1 := FLOOR(v_sessions_n * (0.30 + random() * 0.4))::int;
        v_c2 := v_sessions_n - v_c1;
        -- ~30 kW average throughput → minutes
        v_minutes := GREATEST(v_sessions_n * 15, ROUND(v_kwh / 30.0 * 60)::int);

        -- Build the sessions JSONB array
        v_sessions_json := (
          SELECT jsonb_agg(
            jsonb_build_object(
              'gun',         CASE WHEN i <= v_c1 THEN 'C1' ELSE 'C2' END,
              'start',       to_char(v_date::timestamp + ((6 + i*1.5)::numeric * interval '1 hour'),
                                     'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'end',         to_char(v_date::timestamp + ((6 + i*1.5)::numeric * interval '1 hour')
                                     + (v_minutes::numeric / v_sessions_n) * interval '1 minute',
                                     'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'kwh',         ROUND((v_kwh / v_sessions_n)::numeric, 2),
              'durationMin', ROUND((v_minutes::numeric / v_sessions_n)::numeric, 1),
              'peakKw',      ROUND((22 + random() * 15)::numeric, 2),
              'endSoc',      ROUND((55 + random() * 45)::numeric)
            )
          )
          FROM generate_series(1, v_sessions_n) AS i
        );
      END IF;

      INSERT INTO public.uploads
        (site_id, report_date, charger_id,
         total_kwh, total_sessions, c1_sessions, c2_sessions, sessions)
      VALUES
        (v_site.id, v_date, v_site.charger_id,
         v_kwh, v_sessions_n, v_c1, v_c2, COALESCE(v_sessions_json, '[]'::jsonb));

      v_date := v_date + 1;
    END LOOP;

    RAISE NOTICE 'Generated demo data for site: %', v_site.name;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 3) Verify — show what was generated
-- ──────────────────────────────────────────────────────────────
SELECT
  s.name,
  s.currency,
  count(u.id) AS days_of_data,
  ROUND(sum(u.total_kwh)::numeric, 0) AS total_kwh,
  sum(u.total_sessions) AS total_cars,
  ROUND((sum(u.total_kwh) * s.charging_fee)::numeric, 0) AS revenue,
  min(u.report_date) AS first_day,
  max(u.report_date) AS last_day
FROM public.sites s
LEFT JOIN public.uploads u ON u.site_id = s.id
GROUP BY s.id, s.name, s.currency, s.charging_fee
ORDER BY
  CASE WHEN s.name ILIKE '%duiven%' THEN 0 ELSE 1 END,  -- Duiven on top
  s.name;

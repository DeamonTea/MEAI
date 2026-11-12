-- Preserve analysis fields that are not represented by unit_items rows.
alter table public.units add column if not exists analysis_meta jsonb;

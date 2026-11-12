-- Run after MEAI-Supabase-schema.sql and 20261112_security_hardening.sql.
create table if not exists public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  set_key text not null,
  item_key text not null,
  kind text not null,
  origin text not null check (origin in ('original','ai')),
  correct boolean not null default false,
  score numeric,
  chosen text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists exercise_attempts_user_created_idx
  on public.exercise_attempts(user_id, created_at desc);
create index if not exists exercise_attempts_unit_set_created_idx
  on public.exercise_attempts(user_id, unit_id, set_key, created_at desc);

alter table public.unit_items drop constraint if exists unit_items_source_check;
alter table public.unit_items add constraint unit_items_source_check
  check (source in ('gemini_parsed','cerebras_generated','ai_generated'));

alter table public.exercise_attempts enable row level security;
revoke all on public.exercise_attempts from anon, authenticated;
drop policy if exists exercise_attempts_read_self_or_admin on public.exercise_attempts;
create policy exercise_attempts_read_self_or_admin on public.exercise_attempts
  for select to authenticated using (user_id = auth.uid() or public.meai_is_admin());
drop policy if exists exercise_attempts_insert_self on public.exercise_attempts;
create policy exercise_attempts_insert_self on public.exercise_attempts
  for insert to authenticated with check (user_id = auth.uid());
grant select, insert on public.exercise_attempts to authenticated;

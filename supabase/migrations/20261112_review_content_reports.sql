-- MEAI review status and user content reports.
-- Run after MEAI-Supabase-schema.sql in the target Supabase project.

alter table public.units
  add column if not exists approval_status text not null default 'pending',
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_by_name text not null default '',
  add column if not exists reviewed_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='units_reviewed_by_fkey' and conrelid='public.units'::regclass) then
    alter table public.units add constraint units_reviewed_by_fkey foreign key (reviewed_by) references public.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='units_approval_status_check' and conrelid='public.units'::regclass) then
    alter table public.units add constraint units_approval_status_check check (approval_status in ('pending','approved'));
  end if;
end $$;

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units(id) on delete set null,
  reporter_id uuid not null constraint content_reports_reporter_id_fkey references public.users(id) on delete cascade,
  content_type text not null check (content_type in ('vocabulary','exercise','reading','grammar','ai_practice','extension_vocabulary','extension_exercise','extension_reading')),
  reported_content jsonb not null,
  note text not null default '',
  status text not null default 'open' check (status in ('open','resolved')),
  resolved_by uuid constraint content_reports_resolved_by_fkey references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists content_reports_status_created_idx on public.content_reports(status, created_at desc);
create index if not exists content_reports_reporter_idx on public.content_reports(reporter_id, created_at desc);

alter table public.units enable row level security;
alter table public.content_reports enable row level security;

-- This mapping only works for callers using Supabase Auth with auth.uid() equal to public.users.id.
-- MEAI's current desktop login uses its own users/password_hash table and a service_role/secret key;
-- service_role bypasses RLS. The desktop IPC also checks the MEAI role before privileged operations.
create or replace function public.meai_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.meai_is_admin() from public;
grant execute on function public.meai_is_admin() to authenticated;

drop policy if exists units_read_authenticated on public.units;
create policy units_read_authenticated on public.units
  for select to authenticated using (true);
drop policy if exists units_approval_update_admin on public.units;
create policy units_approval_update_admin on public.units
  for update to authenticated using (public.meai_is_admin()) with check (public.meai_is_admin());

-- Limit authenticated direct updates to review metadata only.
revoke insert, update, delete on public.units from anon, authenticated;
grant select on public.units to authenticated;
grant update (approval_status, reviewed_by, reviewed_by_name, reviewed_at) on public.units to authenticated;

drop policy if exists content_reports_read_own_or_admin on public.content_reports;
create policy content_reports_read_own_or_admin on public.content_reports
  for select to authenticated using (reporter_id = auth.uid() or public.meai_is_admin());
drop policy if exists content_reports_insert_self on public.content_reports;
create policy content_reports_insert_self on public.content_reports
  for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists content_reports_update_admin on public.content_reports;
create policy content_reports_update_admin on public.content_reports
  for update to authenticated using (public.meai_is_admin()) with check (public.meai_is_admin());
revoke all on public.content_reports from anon, authenticated;
grant select, insert, update on public.content_reports to authenticated;

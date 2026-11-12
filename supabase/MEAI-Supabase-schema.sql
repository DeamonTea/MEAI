create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin','user')),
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  book_name text not null,
  filename text not null default '',
  branch text not null default 'unassigned',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books(id) on delete cascade,
  unit_name text not null,
  raw_document text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.units add column if not exists book_id uuid references public.books(id) on delete cascade;
alter table public.units add column if not exists analysis_meta jsonb;

create table if not exists public.unit_items (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  item_type text not null check (item_type in ('vocabulary','exercise','reading')),
  content jsonb not null,
  source text not null default 'gemini_parsed' check (source in ('gemini_parsed','cerebras_generated')),
  created_at timestamptz not null default now()
);

create table if not exists public.learning_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  activity_type text not null check (activity_type in ('exercise','writing','conversation')),
  score numeric,
  user_submission text not null default '',
  ai_feedback text not null default '',
  progress_comparison text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.vocabulary_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  review_key text not null,
  unit_id uuid references public.units(id) on delete cascade,
  term text not null,
  repetitions integer not null default 0,
  ease_factor numeric not null default 2.5,
  interval_days numeric not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed timestamptz not null default now(),
  unique(user_id, review_key)
);
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists units_book_idx on public.units(book_id);
create index if not exists unit_items_unit_idx on public.unit_items(unit_id);
create index if not exists learning_history_user_created_idx on public.learning_history(user_id, created_at desc);
create index if not exists ai_usage_user_created_idx on public.ai_usage(user_id, created_at desc);
create index if not exists vocabulary_reviews_due_idx on public.vocabulary_reviews(user_id, due_at);

-- Deny direct access from publishable/anon and authenticated client keys.
-- The desktop app's configured elevated key is required for its custom login flow.
alter table public.users enable row level security;
alter table public.books enable row level security;
alter table public.units enable row level security;
alter table public.unit_items enable row level security;
alter table public.learning_history enable row level security;
alter table public.reminders enable row level security;
alter table public.vocabulary_reviews enable row level security;
alter table public.ai_usage enable row level security;

insert into public.users(username,password_hash,role,full_name)
values ('admin1', encode(digest('admin123','sha256'),'hex'), 'admin', 'Administrator')
on conflict (username) do nothing;


-- Review status and user content reports (same idempotent SQL is in migrations/20261112_review_content_reports.sql).
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

-- MEAI security hardening. Run after MEAI-Supabase-schema.sql and the
-- 20261112_review_content_reports.sql migration.
-- These policies apply to Supabase Auth JWTs whose auth.uid() maps to users.id.
-- The current desktop app uses a service_role/secret key, which bypasses RLS;
-- see the app's security review and follow-up work before exposing a client app.

alter table public.users
  add column if not exists must_change_password boolean not null default false;
alter table public.users alter column must_change_password set default true;

-- Require the seeded default account to change its known starter password.
update public.users
set must_change_password = true
where username = 'admin1'
  and password_hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
  and must_change_password = false;

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users(id) on delete set null,
  action text not null check (action in (
    'user_created', 'users_excel_imported', 'user_role_changed',
    'ai_keys_changed', 'unit_approval_changed'
  )),
  target_type text not null default '',
  target_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_actor_idx
  on public.admin_audit_logs(actor_id, created_at desc);

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

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'users', 'books', 'units', 'unit_items', 'learning_history',
    'reminders', 'vocabulary_reviews', 'ai_usage', 'content_reports',
    'admin_audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
  end loop;
end $$;

-- Accounts: users may see their own non-secret profile; Admins can manage accounts.
drop policy if exists users_read_self_or_admin on public.users;
create policy users_read_self_or_admin on public.users for select to authenticated
  using (id = auth.uid() or public.meai_is_admin());
drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users for insert to authenticated
  with check (public.meai_is_admin());
drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users for update to authenticated
  using (public.meai_is_admin()) with check (public.meai_is_admin());
drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users for delete to authenticated
  using (public.meai_is_admin());
grant select (id, username, full_name, role, must_change_password, created_at)
  on public.users to authenticated;
grant insert (id, username, full_name, role, must_change_password, password_hash)
  on public.users to authenticated;
grant update (username, full_name, role, must_change_password, password_hash)
  on public.users to authenticated;
grant delete on public.users to authenticated;

-- Shared curriculum is readable to signed-in users and writable only by Admins.
drop policy if exists books_read_authenticated on public.books;
create policy books_read_authenticated on public.books for select to authenticated using (true);
drop policy if exists books_admin_write on public.books;
create policy books_admin_write on public.books for all to authenticated
  using (public.meai_is_admin()) with check (public.meai_is_admin());
grant select, insert, update, delete on public.books to authenticated;

drop policy if exists units_read_authenticated on public.units;
create policy units_read_authenticated on public.units for select to authenticated using (true);
drop policy if exists units_admin_write on public.units;
create policy units_admin_write on public.units for all to authenticated
  using (public.meai_is_admin()) with check (public.meai_is_admin());
grant select, insert, update, delete on public.units to authenticated;

drop policy if exists unit_items_read_authenticated on public.unit_items;
create policy unit_items_read_authenticated on public.unit_items for select to authenticated using (true);
drop policy if exists unit_items_admin_write on public.unit_items;
create policy unit_items_admin_write on public.unit_items for all to authenticated
  using (public.meai_is_admin()) with check (public.meai_is_admin());
grant select, insert, update, delete on public.unit_items to authenticated;

-- Personal learning records are private; Admins may inspect all learner activity.
drop policy if exists learning_history_read_self_or_admin on public.learning_history;
create policy learning_history_read_self_or_admin on public.learning_history for select to authenticated
  using (user_id = auth.uid() or public.meai_is_admin());
drop policy if exists learning_history_insert_self on public.learning_history;
create policy learning_history_insert_self on public.learning_history for insert to authenticated
  with check (user_id = auth.uid());
grant select, insert on public.learning_history to authenticated;

drop policy if exists vocabulary_reviews_read_self_or_admin on public.vocabulary_reviews;
create policy vocabulary_reviews_read_self_or_admin on public.vocabulary_reviews for select to authenticated
  using (user_id = auth.uid() or public.meai_is_admin());
drop policy if exists vocabulary_reviews_write_self on public.vocabulary_reviews;
create policy vocabulary_reviews_write_self on public.vocabulary_reviews for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.vocabulary_reviews to authenticated;

drop policy if exists ai_usage_read_self_or_admin on public.ai_usage;
create policy ai_usage_read_self_or_admin on public.ai_usage for select to authenticated
  using (user_id = auth.uid() or public.meai_is_admin());
drop policy if exists ai_usage_insert_self on public.ai_usage;
create policy ai_usage_insert_self on public.ai_usage for insert to authenticated
  with check (user_id = auth.uid());
grant select, insert on public.ai_usage to authenticated;

drop policy if exists reminders_read_self_or_admin on public.reminders;
create policy reminders_read_self_or_admin on public.reminders for select to authenticated
  using (user_id = auth.uid() or public.meai_is_admin());
drop policy if exists reminders_update_self on public.reminders;
create policy reminders_update_self on public.reminders for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists reminders_admin_write on public.reminders;
create policy reminders_admin_write on public.reminders for all to authenticated
  using (public.meai_is_admin()) with check (public.meai_is_admin());
grant select, insert, delete on public.reminders to authenticated;
grant update (is_read) on public.reminders to authenticated;

-- Reports: own create/read, Admin read/update. No report deletion via client.
drop policy if exists content_reports_read_own_or_admin on public.content_reports;
create policy content_reports_read_own_or_admin on public.content_reports for select to authenticated
  using (reporter_id = auth.uid() or public.meai_is_admin());
drop policy if exists content_reports_insert_self on public.content_reports;
create policy content_reports_insert_self on public.content_reports for insert to authenticated
  with check (reporter_id = auth.uid());
drop policy if exists content_reports_update_admin on public.content_reports;
create policy content_reports_update_admin on public.content_reports for update to authenticated
  using (public.meai_is_admin()) with check (public.meai_is_admin());
grant select, insert, update on public.content_reports to authenticated;

-- Audit entries are visible only to Admins and append-only for authenticated clients.
drop policy if exists admin_audit_logs_read_admin on public.admin_audit_logs;
create policy admin_audit_logs_read_admin on public.admin_audit_logs for select to authenticated
  using (public.meai_is_admin());
drop policy if exists admin_audit_logs_insert_admin on public.admin_audit_logs;
create policy admin_audit_logs_insert_admin on public.admin_audit_logs for insert to authenticated
  with check (public.meai_is_admin() and actor_id = auth.uid());
grant select, insert on public.admin_audit_logs to authenticated;
grant usage, select on sequence public.admin_audit_logs_id_seq to authenticated;

create or replace function public.meai_audit_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role then
    insert into public.admin_audit_logs(actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'user_role_changed', 'user', new.id::text,
      jsonb_build_object('old_role', old.role, 'new_role', new.role));
  end if;
  return new;
end;
$$;

revoke all on function public.meai_audit_role_change() from public;
drop trigger if exists meai_audit_role_change on public.users;
create trigger meai_audit_role_change
  after update of role on public.users
  for each row execute function public.meai_audit_role_change();

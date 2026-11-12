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

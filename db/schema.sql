create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  category text not null,
  description text not null default '',
  object_key text not null unique,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  adult_verified boolean not null default false,
  consent_confirmed boolean not null default false,
  rights_confirmed boolean not null default false,
  rejection_reason text,
  moderated_by uuid references users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submissions_status_created_idx on submissions(status, created_at desc);
create index if not exists submissions_user_created_idx on submissions(user_id, created_at desc);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references users(id) on delete set null,
  content_ref text not null,
  reason text not null,
  details text not null,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_status_created_idx on reports(status, created_at desc);

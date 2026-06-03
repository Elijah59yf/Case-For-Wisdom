-- A Case for Wisdom — Supabase / PostgreSQL schema
-- Run in Supabase SQL editor. Idempotent where reasonable.

create extension if not exists "pgcrypto";

-- posts ---------------------------------------------------------------
create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  slug        text not null unique,
  excerpt     text,
  body        text,
  cover_url   text,
  category    varchar(100) default 'Essay',
  read_time   integer      default null,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists posts_published_created_idx
  on posts (published, created_at desc);

-- products ------------------------------------------------------------
create table if not exists products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null unique,
  description      text,
  price            numeric(10,2) not null,
  images           text[] not null default '{}',
  category         text,
  in_stock         boolean not null default true,
  stock_count      integer not null default 0,
  stripe_price_id  text,
  created_at       timestamptz not null default now()
);
create index if not exists products_in_stock_idx on products (in_stock);

-- orders --------------------------------------------------------------
create table if not exists orders (
  id                         uuid primary key default gen_random_uuid(),
  stripe_payment_intent_id   text unique,
  customer_email             text,
  customer_name              text,
  shipping_address           jsonb,
  items                      jsonb not null default '[]'::jsonb,
  total                      numeric(10,2) not null,
  status                     text not null default 'pending',
  created_at                 timestamptz not null default now()
);
create index if not exists orders_status_idx on orders (status);

-- site_settings -------------------------------------------------------
create table if not exists site_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- nav_items -----------------------------------------------------------
create table if not exists nav_items (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  url         text not null,
  position    integer not null default 0,
  visible     boolean not null default true,
  opens_new   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists nav_items_position_idx on nav_items (position);

-- hero_slides ---------------------------------------------------------
create table if not exists hero_slides (
  id          uuid primary key default gen_random_uuid(),
  image_url   text not null,
  caption     text,
  alt_text    text,
  position    integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists hero_slides_active_position_idx
  on hero_slides (active, position);

-- subscribers ---------------------------------------------------------
-- Newsletter signups from the public journal. Inserts are public (anon)
-- on Target A; reads are admin-only. Kept in sync with mariadb-schema.sql.
create table if not exists subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       varchar(500) not null unique,
  created_at  timestamptz not null default now()
);

-- admin_users ---------------------------------------------------------
-- Admin accounts for the Express/JWT (VPS) auth path. On the Cloudflare
-- target admin auth is handled by Supabase Auth; this table backs the
-- self-hosted login and the /admin/admins account manager. Kept in sync
-- with the admin_users table in mariadb-schema.sql.
create table if not exists admin_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  password_hash  text not null,
  created_at     timestamptz not null default now()
);

-- refresh_tokens ------------------------------------------------------
-- Long-lived rotating refresh tokens for the Express/JWT (VPS) auth path.
-- Only the SHA-256 hash of each token is stored, never the raw token.
create table if not exists refresh_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  token_hash  varchar(500) not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_refresh_user  on refresh_tokens (user_id);
create index if not exists idx_refresh_token on refresh_tokens (token_hash);

-- Performance indexes (production hardening) --------------------------
-- Same set as mariadb-schema.sql, kept in sync. Postgres honors DESC.
create index if not exists idx_posts_published   on posts (published, created_at desc);
create index if not exists idx_posts_category    on posts (category, published);
create index if not exists idx_products_in_stock on products (in_stock, created_at desc);
create index if not exists idx_orders_status     on orders (status, created_at desc);
create index if not exists idx_nav_position      on nav_items (visible, position);

-- enable RLS (policies in policies.sql) -------------------------------
alter table posts          enable row level security;
alter table products       enable row level security;
alter table orders         enable row level security;
alter table site_settings  enable row level security;
alter table nav_items      enable row level security;
alter table hero_slides    enable row level security;
alter table subscribers    enable row level security;

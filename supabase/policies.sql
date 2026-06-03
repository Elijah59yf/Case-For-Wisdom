-- A Case for Wisdom — RLS policies
-- Re-run safely: drop-if-exists then create.

-- posts ---------------------------------------------------------------
drop policy if exists "posts read published" on posts;
create policy "posts read published" on posts
  for select using (published = true);

drop policy if exists "posts admin write" on posts;
create policy "posts admin write" on posts
  for all to authenticated
  using (true) with check (true);

-- products ------------------------------------------------------------
drop policy if exists "products read in_stock" on products;
create policy "products read in_stock" on products
  for select using (in_stock = true);

drop policy if exists "products admin write" on products;
create policy "products admin write" on products
  for all to authenticated
  using (true) with check (true);

-- orders --------------------------------------------------------------
drop policy if exists "orders public insert" on orders;
create policy "orders public insert" on orders
  for insert with check (true);

drop policy if exists "orders admin read" on orders;
create policy "orders admin read" on orders
  for select to authenticated using (true);

drop policy if exists "orders admin update" on orders;
create policy "orders admin update" on orders
  for update to authenticated using (true) with check (true);

-- site_settings -------------------------------------------------------
drop policy if exists "settings public read" on site_settings;
create policy "settings public read" on site_settings
  for select using (true);

drop policy if exists "settings admin update" on site_settings;
create policy "settings admin update" on site_settings
  for update to authenticated using (true) with check (true);

drop policy if exists "settings admin insert" on site_settings;
create policy "settings admin insert" on site_settings
  for insert to authenticated with check (true);

-- nav_items -----------------------------------------------------------
drop policy if exists "nav read visible" on nav_items;
create policy "nav read visible" on nav_items
  for select using (visible = true);

drop policy if exists "nav admin write" on nav_items;
create policy "nav admin write" on nav_items
  for all to authenticated using (true) with check (true);

-- hero_slides ---------------------------------------------------------
drop policy if exists "hero_slides read active" on hero_slides;
create policy "hero_slides read active" on hero_slides
  for select using (active = true);

drop policy if exists "hero_slides admin write" on hero_slides;
create policy "hero_slides admin write" on hero_slides
  for all to authenticated using (true) with check (true);

-- subscribers ---------------------------------------------------------
-- Anyone may subscribe (public insert); only an authenticated admin may
-- read the list. Mirrors the orders insert/read split.
drop policy if exists "subscribers public insert" on subscribers;
create policy "subscribers public insert" on subscribers
  for insert with check (true);

drop policy if exists "subscribers admin read" on subscribers;
create policy "subscribers admin read" on subscribers
  for select to authenticated using (true);

-- admin_users ---------------------------------------------------------
-- admin_users has no public RLS policy.
-- All access goes through the Express API (VPS)
-- or Supabase Auth (Cloudflare Target A).
-- Direct table access is intentionally blocked.
drop policy if exists "Admin users — service role only" on admin_users;
create policy "Admin users — service role only" on admin_users
  using (false);

-- A Case for Wisdom — seed data
-- Safe to re-run: upserts.

-- site_settings -------------------------------------------------------
insert into site_settings (key, value) values
  ('site_name',      'A Case for Wisdom'),
  ('tagline',        'The Source. The Sustainer.'),
  ('hero_headline',  'A quiet case for wisdom, written slowly.'),
  ('hero_subtext',   'Essays, reflections, and considered objects rooted in the older streams — scripture, season, and the long patience of a life lived attentively.'),
  ('footer_copy',    'Made slowly in Canada.'),
  ('instagram_url',  ''),
  ('substack_url',   ''),
  ('interstitial_image_url', ''),
  ('about_headline', 'A quiet case for wisdom, kept slowly.'),
  ('about_body',     'A Case for Wisdom is an editorial home for faith and wisdom writing — essays, reflections, and letters drawn from scripture, season, and the long patience of a life lived attentively. It is written slowly and published without hurry, in the conviction that some things are best understood at a walking pace.'),
  ('about_quote',    'The beginning of wisdom is this: get wisdom, and whatever you get, get insight.'),
  ('about_quote_attr', 'Proverbs 4:7')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- nav_items -----------------------------------------------------------
insert into nav_items (label, url, position, visible)
select 'Journal', '/', 1, true
where not exists (select 1 from nav_items where label = 'Journal');

insert into nav_items (label, url, position, visible)
select 'About', '/about', 2, true
where not exists (select 1 from nav_items where label = 'About');

insert into nav_items (label, url, position, visible)
select 'Shop', '/shop', 3, true
where not exists (select 1 from nav_items where label = 'Shop');

insert into nav_items (label, url, position, visible)
select 'Events', '/events.html', 4, true
where not exists (select 1 from nav_items where label = 'Events');

-- admin_users ---------------------------------------------------------
-- Default admin account for the Express/JWT (VPS) auth path.
-- Change this password immediately
insert into admin_users (email, password_hash) values
  ('admin@acaseforwisdom.com', '$2a$10$N3SvPbtKjYqJajUYzNtwLObZ5k4yeWn4z39YR0e0IQlUU038fYwdG')
on conflict (email) do update set password_hash = excluded.password_hash;

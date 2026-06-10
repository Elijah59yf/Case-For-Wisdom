-- A Case for Wisdom — MariaDB seed data (local development)
-- Mirror of seed.sql, translated for MariaDB. Safe to re-run.

-- site_settings -------------------------------------------------------
INSERT INTO site_settings (`key`, `value`) VALUES
  ('site_name',               'A Case for Wisdom'),
  ('tagline',                 'The Source. The Sustainer.'),
  ('hero_headline',           'A quiet case for wisdom, written slowly.'),
  ('hero_subtext',            'Essays, reflections, and considered objects rooted in the older streams — scripture, season, and the long patience of a life lived attentively.'),
  ('footer_copy',             'Made slowly in Canada.'),
  ('instagram_url',           ''),
  ('substack_url',            ''),
  ('interstitial_image_url',  ''),
  ('about_headline',          'A quiet case for wisdom, kept slowly.'),
  ('about_body',              'A Case for Wisdom is an editorial home for faith and wisdom writing — essays, reflections, and letters drawn from scripture, season, and the long patience of a life lived attentively. It is written slowly and published without hurry, in the conviction that some things are best understood at a walking pace.'),
  ('about_quote',             'The beginning of wisdom is this: get wisdom, and whatever you get, get insight.'),
  ('about_quote_attr',        'Proverbs 4:7')
ON DUPLICATE KEY UPDATE
  `value` = VALUES(`value`);

-- nav_items -----------------------------------------------------------
INSERT INTO nav_items (label, url, position, visible)
SELECT * FROM (SELECT 'Journal' AS label, '/' AS url, 1 AS position, 1 AS visible) t
WHERE NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'Journal');

INSERT INTO nav_items (label, url, position, visible)
SELECT * FROM (SELECT 'About', '/about', 2, 1) t
WHERE NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'About');

INSERT INTO nav_items (label, url, position, visible)
SELECT * FROM (SELECT 'Shop', '/shop', 3, 1) t
WHERE NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'Shop');

INSERT INTO nav_items (label, url, position, visible)
SELECT * FROM (SELECT 'Events', '/events.html', 4, 1) t
WHERE NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'Events');

-- admin_users ---------------------------------------------------------
-- Default admin account for local-dev JWT login.
-- Change this password immediately
INSERT INTO admin_users (email, password_hash) VALUES
  ('admin@acaseforwisdom.com', '$2a$10$N3SvPbtKjYqJajUYzNtwLObZ5k4yeWn4z39YR0e0IQlUU038fYwdG')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);

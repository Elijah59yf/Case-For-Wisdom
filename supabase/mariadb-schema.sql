-- A Case for Wisdom — MariaDB schema (local development)
-- Run: mysql -u elijah caseforwisdom < mariadb-schema.sql
-- Compatible with MariaDB 10.7+.

CREATE TABLE IF NOT EXISTS posts (
  id          CHAR(36)      NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  title       TEXT          NOT NULL,
  slug        VARCHAR(255)  NOT NULL UNIQUE,
  excerpt     TEXT,
  body        LONGTEXT,
  cover_url   TEXT,
  category    VARCHAR(100)  DEFAULT 'Essay',
  read_time   INT           DEFAULT NULL,
  published   TINYINT(1)    NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX posts_published_created_idx (published, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id               CHAR(36)        NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  name             TEXT            NOT NULL,
  slug             VARCHAR(255)    NOT NULL UNIQUE,
  description      TEXT,
  price            DECIMAL(10,2)   NOT NULL,
  images           JSON            NOT NULL,
  category         VARCHAR(120),
  in_stock         TINYINT(1)      NOT NULL DEFAULT 1,
  stock_count      INT             NOT NULL DEFAULT 0,
  stripe_price_id  VARCHAR(255),
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX products_in_stock_idx (in_stock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id                          CHAR(36)       NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  stripe_payment_intent_id    VARCHAR(255)   UNIQUE,
  customer_email              VARCHAR(255),
  customer_name               VARCHAR(255),
  shipping_address            JSON,
  items                       JSON           NOT NULL,
  total                       DECIMAL(10,2)  NOT NULL,
  status                      VARCHAR(32)    NOT NULL DEFAULT 'pending',
  created_at                  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX orders_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_settings (
  `key`       VARCHAR(64)  NOT NULL PRIMARY KEY,
  value       TEXT,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nav_items (
  id          CHAR(36)      NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  label       VARCHAR(120)  NOT NULL,
  url         VARCHAR(512)  NOT NULL,
  position    INT           NOT NULL DEFAULT 0,
  visible     TINYINT(1)    NOT NULL DEFAULT 1,
  opens_new   TINYINT(1)    NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX nav_items_position_idx (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hero_slides (
  id          CHAR(36)       NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  image_url   VARCHAR(1000)  NOT NULL,
  caption     VARCHAR(500),
  alt_text    VARCHAR(500),
  position    INT            NOT NULL DEFAULT 0,
  active      TINYINT(1)     NOT NULL DEFAULT 1,
  created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX hero_slides_active_position_idx (active, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Newsletter subscribers --------------------------------------------
CREATE TABLE IF NOT EXISTS subscribers (
  id          CHAR(36)      NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  email       VARCHAR(500)  NOT NULL UNIQUE,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Events --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id            CHAR(36)       NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  title         TEXT           NOT NULL,
  slug          VARCHAR(255)   NOT NULL UNIQUE,
  description   TEXT,
  event_date    DATETIME       NOT NULL,
  end_date      DATETIME,
  location      TEXT,
  location_url  VARCHAR(1000),
  is_online     TINYINT(1)     NOT NULL DEFAULT 0,
  is_inperson   TINYINT(1)     NOT NULL DEFAULT 0,
  -- Ticketing / registration columns. is_paid + price drive paid events;
  -- capacity NULL means unlimited; registration_open lets an admin force-close.
  is_paid           TINYINT(1)     NOT NULL DEFAULT 0,
  price             DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  capacity          INT            DEFAULT NULL,
  registration_open TINYINT(1)     NOT NULL DEFAULT 1,
  cover_url     TEXT,
  published     TINYINT(1)     NOT NULL DEFAULT 0,
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX events_published_date_idx (published, event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- On an existing install these ALTERs add the ticketing columns to events.
-- (Fresh installs already have them from the CREATE above; ignore "duplicate
-- column" errors when re-applying.)
-- ALTER TABLE events ADD COLUMN is_paid TINYINT(1) DEFAULT 0 AFTER is_inperson;
-- ALTER TABLE events ADD COLUMN price DECIMAL(10,2) DEFAULT 0.00 AFTER is_paid;
-- ALTER TABLE events ADD COLUMN capacity INT DEFAULT NULL AFTER price;            -- NULL = unlimited
-- ALTER TABLE events ADD COLUMN registration_open TINYINT(1) DEFAULT 1 AFTER capacity; -- admin can force-close

-- Event registrations / tickets -------------------------------------
CREATE TABLE IF NOT EXISTS event_registrations (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  event_id      CHAR(36) NOT NULL,
  ticket_ref    VARCHAR(20) UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  email         VARCHAR(500) NOT NULL,
  paid          TINYINT(1) DEFAULT 0,
  amount_paid   DECIMAL(10,2) DEFAULT 0.00,
  attended      TINYINT(1) DEFAULT 0,
  checked_in_at DATETIME DEFAULT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reg_event (event_id),
  INDEX idx_reg_ticket (ticket_ref),
  INDEX idx_reg_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin users for local-dev JWT login -------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  email          VARCHAR(255)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255)  NOT NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Refresh tokens for rotating admin sessions -------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id    CHAR(36) NOT NULL,
  token_hash VARCHAR(500) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_refresh_user (user_id),
  INDEX idx_refresh_token (token_hash(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed defaults (idempotent) ----------------------------------------
INSERT IGNORE INTO site_settings (`key`, value) VALUES
  ('site_name',      'A Case for Wisdom'),
  ('tagline',        'The Source. The Sustainer.'),
  ('hero_headline',  'A quiet case for wisdom, written slowly.'),
  ('hero_subtext',   'Essays, reflections, and considered objects rooted in the older streams — scripture, season, and the long patience of a life lived attentively.'),
  ('footer_copy',    'Made slowly in Canada.'),
  ('instagram_url',  ''),
  ('substack_url',   ''),
  ('interstitial_image_url', '');

INSERT INTO nav_items (label, url, position, visible)
SELECT * FROM (SELECT 'Journal' AS label, '/blog' AS url, 1 AS position, 1 AS visible) t
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

-- Performance indexes (production hardening) ------------------------------
-- These cover the hot read paths: published-post listing, category filters,
-- in-stock product listing, order-status queries, and nav ordering.
CREATE INDEX IF NOT EXISTS idx_posts_published     ON posts (published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category      ON posts (category, published);
CREATE INDEX IF NOT EXISTS idx_products_in_stock   ON products (in_stock, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_position        ON nav_items (visible, position);
CREATE INDEX IF NOT EXISTS idx_events_published     ON events (published, event_date);

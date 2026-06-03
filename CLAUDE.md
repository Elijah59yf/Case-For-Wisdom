# CLAUDE.md — A Case for Wisdom

This file is the persistent constitution for every session on this project. **Read it before touching any file.** If a request conflicts with the rules here, surface the conflict before acting.

---

## 1. Project Overview

**Name:** A Case for Wisdom
**Tagline:** *"The Source. The Sustainer."*
**Owner:** A personal brand site for a faith-based wisdom & spiritual content creator based in Canada.
**Purpose:** Editorial home, self-published blog, and physical-merch shop (Stripe, CAD).

**Logo:** Tree of Life with a winding river, mountain background, gold circular border.
**Voice & tone:** Organic luxury editorial — *Kinfolk* magazine meets biblical wisdom literature. Quiet, considered, never loud or gimmicky.

The site has two audiences:
- **Public readers / shoppers** — visit the editorial frontend.
- **The owner (admin)** — logs in to write blog posts (Quill.js) and manage products. Admin UI is functional-first, not editorial.

---

## 2. Stack — authoritative

The same static frontend (HTML/CSS/JS) ships to **two deployment targets**. They differ only in how the frontend reaches data, auth, storage, and payments. See §3 for the target breakdown and §4 for environment variables.

**Frontend** — Vanilla **HTML + CSS + JS**. Identical files on both targets.
- Zero frameworks (no React/Vue/Svelte/Astro/Next/Nuxt).
- Zero CSS frameworks (no Tailwind/Bootstrap/Bulma). CSS variables in `tokens.css` are the design system.
- No bundler — plain `<script type="module">` imports, ES modules from CDN where needed.
- No UI component libraries. Build everything from scratch.

**Data access — one client, two paths.** [assets/js/lib/api.js](assets/js/lib/api.js) is the single client every other module imports. It detects the target from `window.location.hostname` (`IS_VPS`) and routes each call:
- **Target A (Cloudflare):** Supabase directly via `@supabase/supabase-js`, loaded lazily from [assets/js/lib/supabase.js](assets/js/lib/supabase.js).
- **Target B (VPS):** the **Express** REST API at `/api/*` via `fetch()`.

Exported function names and return shapes are identical across targets; calling code never knows which path ran.

**Database**
- Target A: **Supabase Postgres**, queried from the browser via supabase-js (RLS is the boundary — see §9.2).
- Target B: **MariaDB** via Express + `mysql2/promise`, behind the server-side adapter pattern selected by `DB_ADAPTER`. The server's own Supabase adapter (`server/db/adapters/supabase.js`) also exists for running Express against Supabase if ever needed.

**Storage**
- Target A: **Supabase Storage** (`uploads` bucket), public URLs.
- Target B: local disk via the Express upload route (`UPLOAD_ADAPTER=local`, served at `/uploads/*`).

**Auth — two paths behind one module.** Admin pages import **only** [assets/js/auth.js](assets/js/auth.js) (`signIn` / `signOut` / `getSession` / `isAuthenticated`). They never call `supabase.auth` or `localStorage` directly.
- Target A: **Supabase Auth** (`signInWithPassword`); session managed by the SDK.
- Target B: **JWT via Express** (`bcryptjs` + `jsonwebtoken`); token stored as `acfw_token` in `localStorage`; `authGuard` verifies the `Authorization: Bearer <token>` header.

**Payments** — **Stripe**, Canadian account, **CAD only**. The order total is always recalculated server-side against canonical DB prices; client prices are never trusted; the webhook signature is always verified.
- Target A: **Cloudflare Pages Functions** — [functions/api/create-payment-intent.js](functions/api/create-payment-intent.js) and [functions/api/stripe-webhook.js](functions/api/stripe-webhook.js). No Express.
- Target B: **Express** Stripe route(s) under `server/routes/`, via [server/services/stripe.service.js](server/services/stripe.service.js).

**Rich text** — **Quill.js** via CDN, admin blog editor pages only. Output stored as HTML in `posts.body`.

**Fonts** — Google Fonts: **Cormorant Garamond** (headings/display) + **DM Sans** (body). Nothing else.

**Hard rules — read these as inviolable:**
- **One data client.** No module other than [assets/js/lib/api.js](assets/js/lib/api.js) calls `fetch()` against `/api/*` or queries Supabase. It alone knows the active target and base URL.
- **One Supabase import on the frontend.** `@supabase/supabase-js` is imported in exactly one frontend file — [assets/js/lib/supabase.js](assets/js/lib/supabase.js) — and only on Target A (loaded lazily so VPS pages never fetch it). The server keeps its own separate client in `server/db/adapters/supabase.js`.
- **One auth module.** Admin pages touch auth only through [assets/js/auth.js](assets/js/auth.js) — never `supabase.auth` or raw `localStorage`.
- **Secrets never reach the browser.** The Stripe **secret** key, Stripe **webhook** secret, Supabase **service role** key, and **JWT** secret live only server-side: `server/.env` / Render (Target B) or the Cloudflare Pages dashboard (Target A). Only the Supabase **anon** key and Stripe **publishable** key may appear client-side — the anon key via `<meta>` tags (§4), never hardcoded in a JS file.
- **Total recalculated server-side; webhook signature always verified** — on both targets.

---

## 3. Deployment Targets

The site runs on either of two independent targets. **Both serve the identical `/` frontend** (HTML/CSS/JS); only the data / auth / storage / payment wiring differs. [assets/js/lib/api.js](assets/js/lib/api.js) chooses the path at load time from `window.location.hostname`.

### 3.1 Target A — Cloudflare + Supabase (default production)

| Concern | Implementation |
|---|---|
| Frontend | Cloudflare Pages (static) |
| Database | Supabase, **direct from the browser** via supabase-js |
| Auth | Supabase Auth |
| Storage | Supabase Storage (`uploads` bucket) |
| Payments | Cloudflare Pages Functions — `functions/api/create-payment-intent.js`, `functions/api/stripe-webhook.js` |
| Express | **Not used** |

The Supabase URL + **anon** key are injected into each HTML page as `<meta name="supabase-url">` / `<meta name="supabase-anon">` and read by [assets/js/lib/supabase.js](assets/js/lib/supabase.js). The security boundary is **Supabase RLS** ([supabase/policies.sql](supabase/policies.sql)).

### 3.2 Target B — VPS / self-hosted

| Concern | Implementation |
|---|---|
| Frontend | Nginx (or any static server) |
| Database | MariaDB, **via Express** |
| Auth | JWT, via Express |
| Storage | Local disk, via the Express upload route |
| Payments | Express Stripe routes under `server/routes/` |
| Express | Runs as the API layer on the VPS |

`api.js` treats `localhost` / `127.0.0.1` / `0.0.0.0` and the configured VPS domain as Target B and talks to Express at `/api/*`. The security boundary is **Express + `authGuard`** (§9.2).

### 3.3 How `api.js` chooses

```js
const VPS_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0'];
const IS_VPS = VPS_HOSTS.includes(location.hostname)
  || location.hostname.endsWith('.your-vps-domain.com'); // set when known
// IS_VPS  → Express REST via fetch()
// else    → Supabase via supabase-js
```

Update the VPS domain check and `BASE_URL` in `api.js` once the real VPS host is known.

---

## 4. Environment Variables

Two targets, two homes for secrets. **No server-side secret key is ever shipped to the browser.**

### 4.1 Target A — Cloudflare

**Browser — via `<meta>` tags on every HTML page (public values only):**

| Meta tag | Value |
|---|---|
| `supabase-url` | Supabase project URL |
| `supabase-anon` | Supabase **anon** (publishable) key |
| `stripe-publishable` | Stripe **publishable** key (for Stripe.js) |

**Cloudflare Pages dashboard — server-side, available to Pages Functions only:**

| Variable | Used by |
|---|---|
| `STRIPE_SECRET_KEY` | create-payment-intent |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook |
| `SUPABASE_URL` | both functions (canonical prices, order writes) |
| `SUPABASE_SERVICE_ROLE_KEY` | both functions (server-side order writes) |

> The two functions need `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` because they run server-side and cannot read the browser's `<meta>` anon key. The service role key stays in the Pages dashboard — never in the repo or the browser.

### 4.2 Target B — VPS (`server/.env`)

| Variable | Notes |
|---|---|
| `DB_ADAPTER` | `mariadb` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` | MariaDB connection |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | signs/verifies admin tokens |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Express Stripe routes |
| `UPLOAD_ADAPTER` / `UPLOAD_DIR` | `local` on disk |

`STRIPE_PUBLISHABLE_KEY` for Target B is public (inlined or served from `/api/settings`) and used by Stripe.js.

---

## 5. Folder Structure (canonical — do not invent new top-level files without reason)

```
acaseforwisdom/
├── CLAUDE.md
├── _redirects                 # Cloudflare Pages redirects
├── _headers                   # Cloudflare Pages headers (CSP, cache, etc.)
├── 404.html
├── index.html                 # Home — journal/post listing
├── post.html                  # Single post — reads ?slug= from URL
├── about.html
├── shop/
│   ├── index.html             # Product list
│   └── product.html           # Single product — reads ?id= from URL
├── cart/
│   └── index.html
├── order-success/
│   └── index.html
├── admin/
│   ├── login.html
│   ├── index.html             # Admin dashboard
│   ├── posts/
│   │   ├── index.html
│   │   ├── new.html
│   │   └── edit.html          # reads ?id= from URL
│   ├── products/
│   │   ├── index.html
│   │   ├── new.html
│   │   └── edit.html          # reads ?id= from URL
│   ├── settings/
│   │   └── index.html         # Site settings + nav manager
│   └── media/
│       └── index.html         # Media library
├── functions/                 # Cloudflare Pages Functions (Target A payments only)
│   └── api/
│       ├── create-payment-intent.js
│       └── stripe-webhook.js
├── assets/
│   ├── css/
│   │   ├── tokens.css         # ALL CSS variables (colors, fonts, spacing, breakpoints)
│   │   ├── global.css         # Reset + base typography
│   │   ├── components.css     # Navbar, footer, buttons, cards (shared)
│   │   ├── blog.css
│   │   ├── shop.css
│   │   └── admin.css
│   ├── js/
│   │   ├── lib/
│   │   │   ├── api.js         # The one and only data client — dual-path (Express ⟷ Supabase)
│   │   │   └── supabase.js    # Frontend supabase-js client (Target A only; reads <meta> keys)
│   │   ├── site.js            # loadNav / loadFooter / loadSettings (chrome)
│   │   ├── auth.js            # signIn/signOut/getSession/isAuthenticated — both targets
│   │   ├── blog.js
│   │   ├── shop.js
│   │   ├── slideshow.js       # Home hero slideshow
│   │   ├── cart.js            # Cart state in localStorage
│   │   ├── checkout.js
│   │   └── admin.js
│   └── images/
│       ├── logo.svg
│       ├── favicon.ico
│       └── og-image.jpg
├── server/                    # Express API (local :3000 / Render in prod)
│   ├── index.js               # App entry: middleware + routes + listen
│   ├── package.json
│   ├── .env / .env.example
│   ├── db/
│   │   ├── index.js           # Adapter selector via DB_ADAPTER
│   │   ├── mariadb-pool.js
│   │   ├── adapters/
│   │   │   ├── mariadb.js     # mysql2/promise implementation
│   │   │   └── supabase.js    # supabase-js implementation (server-only)
│   │   └── queries/           # Validation + shape transforms shared by both adapters
│   ├── routes/                # auth, posts, products, orders, settings, nav, upload, slides
│   ├── middleware/            # authGuard, errorHandler, requestLogger, sanitize
│   ├── services/              # auth, upload, stripe
│   └── utils/                 # slugify, paginate
└── supabase/
    ├── schema.sql             # Postgres schema (production)
    ├── policies.sql           # RLS policies — primary gate on Target A
    ├── seed.sql               # Default settings + nav rows (Postgres)
    ├── mariadb-schema.sql     # MariaDB equivalent (local dev)
    └── mariadb-seed.sql       # MariaDB seed equivalent (local dev)
```

Do not create new CSS files beyond this list without a strong reason. Page-specific styling lives in the existing stylesheets; one-off rules go in the relevant sheet, not new files.

---

## 6. Design System

### 6.1 Brand colors (defined in `assets/css/tokens.css`)

| Variable | Hex | Use |
|---|---|---|
| `--color-cream` | `#F5F0EA` | Page background |
| `--color-green` | `#2B3E1E` | Primary — headlines, nav |
| `--color-gold` | `#B8953A` | **Accent only** — borders, CTAs, underlines, hover. **Never a background fill.** |
| `--color-teal` | `#4A7B82` | Secondary accent |
| `--color-text` | `#1A1A1A` | Body copy |
| `--color-text-muted` | `#6B6B6B` | Captions, metadata |

### 6.2 Typography

- **Cormorant Garamond** — all headings, display text, blog titles, editorial flourishes.
- **DM Sans** — all body, UI labels, buttons, metadata.
- **Never** use Inter, Roboto, Arial, system-ui, or any other font as the primary face.
- All heading sizes use `clamp(min, fluid, max)` — no fixed `px` font sizes on headings.

### 6.3 Layout & feel

- **Editorial, asymmetric, breathing room.** Generous whitespace. Long line lengths for prose (~70ch).
- **Blog cards must be staggered or asymmetric.** Never a uniform 3-column grid of equal cards.
- **Paper grain texture** on cream backgrounds via inline CSS SVG noise filter — subtle.
- **Gold is an accent.** Hairline borders, thin underlines under links on hover, button outlines, divider rules. Never a filled background block.
- **Scroll animations** via the `IntersectionObserver` API only. No GSAP, no AOS, no animation library.

### 6.4 Anti-patterns — never produce these

- Inter / Roboto / Arial / system-ui as the headline font.
- Purple gradients.
- Uniformly rounded corners on every element ("everything is a pill").
- Centered hero with three equal feature cards underneath (generic SaaS landing).
- Gold used as a background fill block.
- Fixed pixel font sizes on headings.

---

## 7. CSS Conventions

- **Mobile-first.** Author for small screens, then use `min-width` media queries to scale up. Breakpoints are variables in `tokens.css`.
- **All colors come from `tokens.css` variables.** Never hardcode hex values inside page or component stylesheets.
- **All spacing comes from token scale variables.** No magic px numbers sprinkled in.
- **No inline `style="..."` in HTML** except true one-offs (e.g., a dynamically-set background image URL). Reach for the stylesheet first.
- **Load order in every HTML page:**
  1. `tokens.css`
  2. `global.css`
  3. `components.css`
  4. Page-specific sheet (`blog.css` / `shop.css` / `admin.css`)
- Class names: lowercase-kebab, BEM-ish where useful (`.post-card`, `.post-card__title`, `.post-card--featured`). Don't over-engineer.

---

## 8. JS Conventions

- **ES modules** only. Each `<script>` tag uses `type="module"`.
- **Single responsibility per module.** `cart.js` knows about the cart, nothing else. `auth.js` knows about auth, nothing else.
- **One data client.** `assets/js/lib/api.js` exports every backend call the frontend ever makes, and is the only file that picks the deployment target (`IS_VPS`) or holds `BASE_URL`. Every other module imports from there. No other file may call `fetch()` against `/api/*` **or** query Supabase directly.
- **One Supabase import.** `@supabase/supabase-js` is imported only in `assets/js/lib/supabase.js`, which `api.js` and `auth.js` load lazily on the Cloudflare target. No page imports it.
- **No spaghetti.** A module exposes a small, named API (`export function loadPosts()`, etc.). No globals on `window`.
- **No `document.write()`. Ever.**
- **No jQuery, no Lodash.** Use the platform.
- Async data: `try { ... } catch (err) { ... }` and show a real error state to the user — never swallow.

### 8.1 Cart state

- Cart lives in `localStorage` under a single key (`cfw_cart`).
- Shape: `[{ id, name, price, qty, image }]`.
- `cart.js` is the only module that reads/writes that key. Everyone else calls `cart.add()`, `cart.remove()`, `cart.items()`, `cart.total()`.

### 8.2 Auth state

- Admin pages use **only** `assets/js/auth.js`: `signIn(email, password)`, `signOut()`, `getSession()`, `isAuthenticated()`. They never read `localStorage` or call `supabase.auth` directly.
- `auth.js` resolves the right path per target:
  - **Target A (Cloudflare):** Supabase Auth. `signIn` → `supabase.auth.signInWithPassword()`; the session is stored and refreshed by the SDK; `getSession()` → `supabase.auth.getSession()`.
  - **Target B (VPS):** JWT. `signIn` → `POST /api/auth/login`; the token is stored as `acfw_token` in `localStorage`; `api.js` attaches `Authorization: Bearer <token>` automatically; `getSession()` decodes the JWT and returns null if missing/expired; a 401 from any admin call clears the token and redirects.
- Admin pages, on load, `await isAuthenticated()` — if false, redirect to `/admin/login.html`.
- `signOut()` clears the JWT (VPS) or calls `supabase.auth.signOut()` (Cloudflare).

---

## 9. Database

Two backends, one logical schema. Target B / local dev uses MariaDB ([supabase/mariadb-schema.sql](supabase/mariadb-schema.sql)); Target A / production uses Postgres on Supabase ([supabase/schema.sql](supabase/schema.sql)). Both are kept in sync — any schema change must land in both files.

### 9.1 Schema (canonical types — Postgres on the left, MariaDB equivalents in [supabase/mariadb-schema.sql](supabase/mariadb-schema.sql))

**`posts`**
- `id` UUID PK
- `title` TEXT
- `slug` TEXT UNIQUE
- `excerpt` TEXT
- `body` TEXT — HTML from Quill
- `cover_url` TEXT
- `published` BOOLEAN DEFAULT `false`
- `created_at` TIMESTAMPTZ
- `updated_at` TIMESTAMPTZ

**`products`**
- `id` UUID PK
- `name` TEXT
- `slug` TEXT UNIQUE
- `description` TEXT
- `price` NUMERIC(10,2) — CAD
- `images` TEXT[]
- `category` TEXT
- `in_stock` BOOLEAN DEFAULT `true`
- `stock_count` INTEGER
- `stripe_price_id` TEXT
- `created_at` TIMESTAMPTZ

**`orders`**
- `id` UUID PK
- `stripe_payment_intent_id` TEXT UNIQUE
- `customer_email` TEXT
- `customer_name` TEXT
- `shipping_address` JSONB
- `items` JSONB
- `total` NUMERIC(10,2)
- `status` TEXT DEFAULT `'pending'`
- `created_at` TIMESTAMPTZ

**`site_settings`** — editable site copy (hero headline, tagline, footer, social URLs).
- `key` TEXT PK
- `value` TEXT
- `updated_at` TIMESTAMPTZ

**`nav_items`** — top nav, managed from the admin settings page.
- `id` UUID PK
- `label` TEXT
- `url` TEXT
- `position` INTEGER DEFAULT `0`
- `visible` BOOLEAN DEFAULT `true`
- `opens_new` BOOLEAN DEFAULT `false`
- `created_at` TIMESTAMPTZ

### 9.2 Security boundary — differs by target

- **Target B (VPS): Express is the boundary.** Every write goes through a route handler protected by `authGuard` (JWT verification). The adapter receives validated input from `db/queries/*.js` and runs the query — there is no path from a browser to MariaDB that skips the server.
- **Target A (Cloudflare): Supabase RLS is the boundary.** The browser talks to Supabase directly with the **anon** key, so [supabase/policies.sql](supabase/policies.sql) is the **primary** gate, not defense-in-depth. Public reads (posts/products/settings/nav/slides) are allowed to `anon`; all writes require an authenticated Supabase Auth session and an admin policy. Order writes from the payment functions use the **service role** key server-side (in the Pages Function), never from the browser. Keep these policies correct — on this target they are the only thing standing between the anon key and your data.

### 9.3 Query rules

- **Never `SELECT *` on `orders` without a `WHERE` clause.** Always scope by id or status — on both the Express adapters and the direct supabase-js queries in `api.js`.
- Public reads filter by `published = true` / `in_stock = true` / `visible = true` / `active = true`. Admin reads (`adminGet*`) do not, and require auth (`authGuard` on VPS; an authenticated session + RLS on Cloudflare).
- **Server side (Express):** new table access goes through the adapter pair — never a one-off `pool.query()` / `supabase.from()` in a route. If a method is missing, add it to **both** adapters with the identical signature.
- **Frontend (Cloudflare path):** direct supabase-js queries live **only** in `api.js`, mirroring the Express route shapes so callers get identical results on both targets.

---

## 10. Stripe / Payments

**Currency:** CAD only. Format with `Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })`.

The frontend flow is identical on both targets — `checkout.js` calls `api.createPaymentIntent({ items, customer_* })`, gets back a `clientSecret`, and confirms with Stripe.js Elements. Only the backend that fulfils that call changes.

**Target A — Cloudflare Pages Functions:**

1. `checkout.js` → `api.createPaymentIntent(...)` → `POST /api/create-payment-intent` ([functions/api/create-payment-intent.js](functions/api/create-payment-intent.js)).
2. The function re-fetches canonical prices from Supabase, **recalculates the total server-side (never trusts client prices)**, creates the Stripe PaymentIntent via the Stripe REST API, and inserts a `pending` `orders` row keyed by the PaymentIntent id.
3. Returns `{ clientSecret }`. `checkout.js` confirms payment, then redirects to `/order-success/`.
4. Stripe calls [functions/api/stripe-webhook.js](functions/api/stripe-webhook.js): it **verifies the signature against `STRIPE_WEBHOOK_SECRET` (Web Crypto HMAC) before anything else**, then on `payment_intent.succeeded` PATCHes the order to `paid` in Supabase using the service role key.

**Target B — Express:**

1. `checkout.js` → `api.createPaymentIntent(...)` → the Express Stripe checkout route under `server/routes/`.
2. The route reads canonical prices via the DB adapter, **recalculates the total server-side**, inserts a `pending` order, and calls [server/services/stripe.service.js](server/services/stripe.service.js) `createPaymentIntent({ amountCents, metadata })`.
3. Returns `{ clientSecret, order_id }`; `checkout.js` confirms and redirects.
4. The Express webhook route calls `stripe.service.verifyWebhook(rawBody, signature)` (using `STRIPE_WEBHOOK_SECRET`) and, on `payment_intent.succeeded`, `db.updateOrderStatus(id, "paid")`.

**Hard rules (both targets):**
- The Stripe **secret** key and **webhook** secret live only server-side — `server/.env`/Render (Target B) or the Cloudflare Pages dashboard (Target A). Never under `assets/` or in any HTML. Only the **publishable** key reaches the browser.
- Webhook signature verification is non-negotiable.
- Never compute the order total in the browser as authoritative.
- On Target B, all Stripe SDK calls go through `server/services/stripe.service.js` — never instantiate `Stripe` directly in a route. On Target A, Stripe is reached over its REST API from the Pages Functions only.

---

## 11. Admin Panel

- Lives under `/admin/`. Single sign-in: email/password (one admin user — the owner). On Target B this checks `admin_users` and the server returns a JWT; on Target A it is a Supabase Auth user.
- `/admin/login.html` is the only page reachable unauthenticated. Every other admin page `await isAuthenticated()` (from `auth.js`) on load and redirects to login if false. On the VPS path a 401 from any admin call clears the token and redirects.
- Aesthetic is **functional-first**: clean, minimal, legible. It does NOT need to match the editorial frontend.
  - DM Sans throughout is fine; Cormorant only for the page title if at all.
  - Plain tables, plain forms, clear buttons. No noise, no decoration.
- **Blog editor** uses Quill.js (CDN). Save the HTML output directly into `posts.body` via `adminUpdatePost`.
- **Product / media editor** uploads images through `api.adminUploadFile(file)` — the Express upload route (local disk) on Target B, or Supabase Storage on Target A — and stores the returned URLs in `products.images[]`.
- **Settings page** (`/admin/settings/`) edits `site_settings` rows and manages `nav_items`. The frontend chrome re-renders from these on every page load.
- Slugs auto-generate from the title/name on first save; editable thereafter.
- "Publish" is a separate explicit action from "Save draft" for posts.

---

## 12. Deployment Notes

Environment variables are catalogued in §4. This section is deploy mechanics.

**Target A — Cloudflare + Supabase (default production).**
- **Frontend:** Cloudflare Pages connected to the repo. Build command empty (static site); output directory is the repo root. Exclude `server/` from the deploy.
- **Functions:** the `functions/` directory deploys automatically with Pages as routes under `/api/*` (`create-payment-intent`, `stripe-webhook`). Set the server-side env vars from §4.1 in the Pages dashboard.
- **Database/Auth/Storage:** Supabase project. Run [supabase/schema.sql](supabase/schema.sql) + [supabase/policies.sql](supabase/policies.sql) + [supabase/seed.sql](supabase/seed.sql); create an `uploads` storage bucket (public read); create the admin Supabase Auth user. Inject the `<meta>` keys from §4.1 into every HTML page.

**Target B — VPS / self-hosted.**
- **Frontend:** served by Nginx (or any static server) from the repo root.
- **API:** `cd server && node index.js` (behind a process manager / reverse proxy). Set `server/.env` from §4.2; point `api.js`'s VPS domain check + `BASE_URL` at the real host.
- **Database/Storage:** MariaDB — run [supabase/mariadb-schema.sql](supabase/mariadb-schema.sql) + [supabase/mariadb-seed.sql](supabase/mariadb-seed.sql); uploads on local disk under `UPLOAD_DIR`.

**`_headers`** — strict Content-Security-Policy. On Target A, `connect-src` must allow the Supabase project origin (`https://*.supabase.co`), Stripe, and the esm.sh CDN that serves supabase-js; on Target B it must allow the Express API origin. Long cache on `/assets/`, `Cache-Control: no-store` on `/admin/*`.

**`_redirects`** — trailing-slash normalization, any legacy URLs.

**Local dev (Target B):** two processes — `cd server && npm start` for the API on `:3000`, and any static server for the frontend (`npx serve .` or similar) on `:8000`. The Express CORS allowlist already includes `http://localhost:8000`. `api.js` detects `localhost` as VPS and talks to `localhost:3000/api` automatically.

---

## 13. Common Pitfalls — never do these

- ❌ Import `@supabase/supabase-js` anywhere on the frontend **except** `assets/js/lib/supabase.js`.
- ❌ Query Supabase or call `fetch()` against `/api/*` from any frontend file other than `assets/js/lib/api.js`. (The `functions/api/*` Pages Functions are server-side, not frontend, and are exempt.)
- ❌ Read `localStorage` or call `supabase.auth` from an admin page — go through `auth.js`.
- ❌ Put the Stripe **secret** key, Stripe **webhook** secret, Supabase **service role** key, or JWT secret in any frontend file, HTML, or `<meta>` tag. (Only the Supabase **anon** key and Stripe **publishable** key may be client-side.)
- ❌ `SELECT *` / `select("*")` on `orders` without a `WHERE` clause — on either target.
- ❌ Skip Stripe webhook signature verification.
- ❌ Add a one-off `pool.query()` or `supabase.from()` call inside an Express route — go through an adapter method.
- ❌ Add an adapter method to only one of the two server adapters. Both must implement the same surface.
- ❌ Let `api.js` exports diverge between targets — same name, same return shape on both Express and Supabase paths.
- ❌ Use `document.write()`.
- ❌ Add a new CSS file outside the defined architecture without a strong reason.
- ❌ Pull in a third-party UI component library.
- ❌ Trust client-supplied prices in the PaymentIntent endpoint.
- ❌ Use Inter / Roboto / Arial / system-ui as the headline font.
- ❌ Use gold (`#B8953A`) as a background fill.
- ❌ Hardcode hex colors in page CSS — pull from `tokens.css`.
- ❌ Build a uniform 3-column equal-card grid for the blog list.
- ❌ Reuse the same card layout for the journal and shop sections — they must be visibly differentiated.
- ❌ Add framework dependencies, bundlers, or build steps "just in case."

---

## Design Personality

The visual direction is: Editorial + Typography First + Light Academia warmth + Leather & Gold material texture.
Reference point: *Image Journal* or *The Point Magazine*.
NOT a church website. NOT a lifestyle blog.
A high-end literary magazine about faith.

Typography does the heavy lifting. Cormorant Garamond italic at large scale IS the design. Trust it.

The journal section and shop section on any page must NEVER share the same layout structure. Differentiate them.

- **Journal cards:** editorial, vertical, narrow, headline-forward, like newspaper column clips.
- **Shop cards:** product-forward, wider, more image area, category label above the image.

Remove any fabricated brand depth — no "VOLUME I", no invented series names, no fake metrics. Only real content.

---

## 14. When in doubt

- **Re-read this file.** If a request would violate a rule here, raise it before doing the work.
- **Prefer editing existing files** over creating new ones.
- **Small, single-responsibility modules.** A new feature usually belongs in an existing file.
- The aesthetic target is *quiet, considered, editorial*. If output starts to look like a generic SaaS landing page, stop and rethink.

---

## Verification Policy

NEVER run automated tests, smoke tests, curl checks, or bash verification scripts unless explicitly asked.
NEVER spin up Python HTTP servers or temporary servers for testing purposes.
NEVER use curl to verify pages work.

After completing any task:
- State what was built in plain English
- List any known issues or things to watch out for
- STOP. Let the developer verify in the browser.

The developer will confirm if something is broken and report back. Do not pre-verify on their behalf.

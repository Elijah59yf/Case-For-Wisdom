// A Case for Wisdom — single API client, dual deployment target.
//
// This file is the ONLY thing the rest of the frontend talks to. Every other
// module imports named functions from here (getPosts, getProducts, …) and never
// learns which backend served the data.
//
// There are two deployment targets (see CLAUDE.md §3):
//
//   TARGET B — VPS / self-hosted   → talk to the Express REST API via fetch().
//   TARGET A — Cloudflare + Supabase → talk to Supabase directly via supabase-js.
//
// The target is chosen at load time from window.location.hostname. The same
// HTML/CSS/JS ships to both; only the data path below differs.

// ── Target detection ──────────────────────────────────────────────────────
// VPS = localhost/loopback during dev, or a known VPS domain in production.
// Everything else (e.g. *.pages.dev, the custom Cloudflare domain) is Cloudflare.
const VPS_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0"];
export const IS_VPS =
  VPS_HOSTS.includes(window.location.hostname) ||
  window.location.hostname.endsWith(".your-vps-domain.com"); // TODO: set real VPS domain

// Express base URL (VPS target only). null on the Cloudflare target.
export const BASE_URL = !IS_VPS
  ? null
  : VPS_HOSTS.includes(window.location.hostname)
    ? "http://localhost:3000/api"
    : "https://api.your-vps-domain.com/api"; // TODO: set real VPS API origin

const TOKEN_KEY = "acfw_token";
const REQUEST_TIMEOUT = 10_000; // 10s

// ── Access-token storage (VPS target) ─────────────────────────────────────
// The short-lived (8h) access token is held in memory as the primary copy.
// It is mirrored to sessionStorage so it survives navigation between admin
// pages (each is a full page load) without persisting indefinitely; we fall
// back to localStorage only when sessionStorage is unavailable. The long-lived
// refresh token never touches JS — it lives in an httpOnly cookie.
let _memToken = null;
const _store = (() => {
  try {
    const k = "__cfw_probe__";
    sessionStorage.setItem(k, "1");
    sessionStorage.removeItem(k);
    return sessionStorage;
  } catch {}
  try {
    localStorage.setItem("__cfw_probe__", "1");
    localStorage.removeItem("__cfw_probe__");
    return localStorage;
  } catch {}
  return null;
})();

export function getToken() {
  if (_memToken) return _memToken;
  try { _memToken = _store?.getItem(TOKEN_KEY) || null; } catch {}
  return _memToken;
}
export function setToken(t) {
  _memToken = t || null;
  try {
    if (t) _store?.setItem(TOKEN_KEY, t);
    else _store?.removeItem(TOKEN_KEY);
  } catch {}
}
export function clearToken() {
  _memToken = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

// ── Typed errors (shared by both targets) ─────────────────────────────────
export class TimeoutError extends Error {
  constructor(msg = "The request timed out. Please try again.") {
    super(msg); this.name = "TimeoutError";
  }
}
export class NetworkError extends Error {
  constructor(msg = "Network error. Check your connection and try again.") {
    super(msg); this.name = "NetworkError";
  }
}
export class ApiError extends Error {
  constructor(message, status, body) { super(message); this.name = "ApiError"; this.status = status; this.body = body; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUPABASE PATH (Cloudflare target)
// ═══════════════════════════════════════════════════════════════════════════
// The supabase client is imported lazily so supabase-js is never fetched on the
// VPS target. On the Cloudflare target the security boundary is Supabase RLS;
// admin writes succeed only when a Supabase Auth session is present (auth.js).
let _sbPromise;
function sb() {
  if (!_sbPromise) _sbPromise = import("./supabase.js").then((m) => m.default);
  return _sbPromise;
}

function sbThrow(error) {
  if (error) throw new ApiError(error.message || "Database error", error.status || 500);
}

// Apply a caller's AbortSignal to a supabase query builder when present.
function withSignal(query, opts) {
  return opts?.signal ? query.abortSignal(opts.signal) : query;
}

// read_time is derived from body length to match the Express posts route.
function withReadTime(post) {
  if (!post) return post;
  return { ...post, read_time: Math.max(1, Math.ceil((post.body?.length ?? 0) / 1000)) };
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPRESS PATH (VPS target)
// ═══════════════════════════════════════════════════════════════════════════
function redirectToLogin() {
  if (!window.location.pathname.endsWith("/admin/login.html")) {
    window.location.href = "/admin/login.html";
  }
}

// Refresh the access token via auth.js (which posts /auth/refresh through the
// transport below). auth.js statically imports this module, so we reach it by
// dynamic import to avoid a circular static dependency. Returns a token or null.
async function tryRefresh() {
  try {
    const { refreshAccessToken } = await import("../auth.js");
    return await refreshAccessToken();
  } catch {
    return null;
  }
}

// Revoke the session (server + client) then bounce to login. Used when a
// refresh attempt fails on a protected call.
async function failSession() {
  try {
    const { signOut } = await import("../auth.js");
    await signOut();
  } catch {}
  clearToken();
  redirectToLogin();
}

// Transport for the refresh endpoint. The httpOnly refresh cookie is sent
// automatically (credentials: include). _noRefresh prevents the 401 handler
// from recursing back into a refresh.
export async function refreshSession() {
  const out = await request("/auth/refresh", { method: "POST", _noRefresh: true });
  if (out?.token) setToken(out.token);
  return out?.token ?? null;
}

async function doFetch(path, { method, finalHeaders, body, externalSignal }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(`${BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body == null ? undefined : JSON.stringify(body),
      credentials: "include", // send/receive the httpOnly refresh cookie
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      if (externalSignal?.aborted) throw err;
      throw new TimeoutError();
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
}

async function request(path, opts = {}) {
  const { method = "GET", body, headers = {}, signal, _noRefresh = false } = opts;
  const finalHeaders = { "Content-Type": "application/json", ...headers };
  const token = getToken();
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await doFetch(path, { method, finalHeaders, body, externalSignal: signal });
  } catch (err) {
    // Auto-retry idempotent GETs exactly once on a transport failure.
    if (method === "GET" && (err instanceof NetworkError || err instanceof TimeoutError)) {
      res = await doFetch(path, { method, finalHeaders, body, externalSignal: signal });
    } else {
      throw err;
    }
  }

  // On a 401 from a protected route, try a single token refresh (via the
  // httpOnly refresh cookie) and replay the original request once. If the
  // refresh fails, sign out and bounce to login.
  if (res.status === 401 && !_noRefresh) {
    const newToken = await tryRefresh();
    if (newToken) {
      return request(path, { ...opts, _noRefresh: true });
    }
    await failSession();
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    let body;
    try { body = await res.json(); if (body?.error) message = body.error; } catch {}
    throw new ApiError(message, res.status, body);
  }
  if (res.status === 204) return null;
  return res.json();
}

function qs(params) {
  if (!params) return "";
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC READS
// ═══════════════════════════════════════════════════════════════════════════
// Each accepts an optional { signal } so callers can cancel in-flight requests.

export async function getPosts(params, opts) {
  if (IS_VPS) return request(`/posts${qs(params)}`, opts);
  const { limit = 20, offset = 0, page = 1 } = params || {};
  const { data, error, count } = await withSignal(
    (await sb())
      .from("posts")
      .select("*", { count: "exact" })
      .eq("published", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    opts
  );
  sbThrow(error);
  return { data: (data ?? []).map(withReadTime), total: count ?? 0, page: Number(page), limit: Number(limit) };
}

export async function getPostBySlug(slug, opts) {
  if (IS_VPS) return request(`/posts/slug/${encodeURIComponent(slug)}`, opts);
  const { data, error } = await withSignal(
    (await sb()).from("posts").select("*").eq("slug", slug).eq("published", true).maybeSingle(),
    opts
  );
  sbThrow(error);
  if (!data) throw new ApiError("not found", 404);
  return withReadTime(data);
}

// Events: published, from the start of today onward, soonest-first.
export async function getEvents(params, opts) {
  if (IS_VPS) return request(`/events${qs(params)}`, opts);
  const { limit = 50, offset = 0 } = params || {};
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  const { data, error } = await withSignal(
    (await sb())
      .from("events")
      .select("*")
      .eq("published", true)
      .gte("event_date", cutoff.toISOString())
      .order("event_date", { ascending: true })
      .range(offset, offset + limit - 1),
    opts
  );
  sbThrow(error);
  return data ?? [];
}

// Past events: published, already finished, most-recent-first (max 20).
export async function getPastEvents(opts) {
  if (IS_VPS) return request(`/events/past`, opts);
  const { data, error } = await withSignal(
    (await sb())
      .from("events")
      .select("*")
      .eq("published", true)
      .lt("event_date", new Date().toISOString())
      .order("event_date", { ascending: false })
      .limit(20),
    opts
  );
  sbThrow(error);
  return data ?? [];
}

export async function getEventBySlug(slug, opts) {
  if (IS_VPS) return request(`/events/${encodeURIComponent(slug)}`, opts);
  const { data, error } = await withSignal(
    (await sb()).from("events").select("*").eq("slug", slug).eq("published", true).maybeSingle(),
    opts
  );
  sbThrow(error);
  if (!data) throw new ApiError("not found", 404);
  return data;
}

export async function getProducts(params, opts) {
  if (IS_VPS) return request(`/products${qs(params)}`, opts);
  const { limit = 20, offset = 0 } = params || {};
  const { data, error } = await withSignal(
    (await sb())
      .from("products")
      .select("*")
      .eq("in_stock", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    opts
  );
  sbThrow(error);
  return data ?? [];
}

export async function getProductById(id, opts) {
  if (IS_VPS) return request(`/products/${encodeURIComponent(id)}`, opts);
  const { data, error } = await withSignal(
    (await sb()).from("products").select("*").eq("id", id).maybeSingle(),
    opts
  );
  sbThrow(error);
  if (!data) throw new ApiError("not found", 404);
  return data;
}

export async function getSettings(opts) {
  if (IS_VPS) return request(`/settings`, opts);
  const { data, error } = await withSignal(
    (await sb()).from("site_settings").select("key, value"),
    opts
  );
  sbThrow(error);
  const out = {};
  for (const r of data || []) out[r.key] = r.value;
  return out;
}

export async function getNavItems(opts) {
  if (IS_VPS) return request(`/nav`, opts);
  const { data, error } = await withSignal(
    (await sb()).from("nav_items").select("*").eq("visible", true).order("position", { ascending: true }),
    opts
  );
  sbThrow(error);
  return data ?? [];
}

export async function getHeroSlides(opts) {
  if (IS_VPS) return request(`/slides`, opts);
  const { data, error } = await withSignal(
    (await sb()).from("hero_slides").select("*").eq("active", true).order("position", { ascending: true }),
    opts
  );
  sbThrow(error);
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHECKOUT
// ═══════════════════════════════════════════════════════════════════════════
// createOrder: persists a pending order with a server-recalculated total. The
// client-supplied price is NEVER trusted — the total is rebuilt from canonical
// product prices on whichever backend is active.
export async function createOrder(payload) {
  if (IS_VPS) return request(`/orders`, { method: "POST", body: payload });

  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) throw new ApiError("items required", 400);

  let total = 0;
  const lineItems = [];
  for (const line of items) {
    const product = await getProductById(line.id);
    const qty = Math.max(1, parseInt(line.qty, 10) || 1);
    total += Number(product.price) * qty;
    lineItems.push({ id: product.id, name: product.name, price: Number(product.price), qty });
  }

  const { data, error } = await (await sb())
    .from("orders")
    .insert({
      customer_email: payload.customer_email ?? null,
      customer_name: payload.customer_name ?? null,
      shipping_address: payload.shipping_address ?? null,
      items: lineItems,
      total: Number(total.toFixed(2)),
      status: "pending",
    })
    .select()
    .single();
  sbThrow(error);
  return data;
}

// createPaymentIntent: hands off to the Stripe layer for the active target.
//   Cloudflare → the Pages Function at /api/create-payment-intent.
//   VPS        → the Express Stripe checkout route (server/routes, see §8).
// Both recalculate the total server-side and return { clientSecret }.
export async function createPaymentIntent(payload) {
  if (IS_VPS) return request(`/checkout/payment-intent`, { method: "POST", body: payload });
  const res = await fetch("/api/create-payment-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    let body;
    try { body = await res.json(); if (body?.error) message = body.error; } catch {}
    throw new ApiError(message, res.status, body);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════
//  NEWSLETTER
// ═══════════════════════════════════════════════════════════════════════════
// subscribe: stores an email in the subscribers table. A duplicate is treated
// as a silent success on both targets — we never reveal that an address is
// already on the list. Returns { ok: true }.
export async function subscribe(email) {
  if (IS_VPS) {
    try {
      return await request(`/subscribe`, { method: "POST", body: { email } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) return { ok: true };
      throw err;
    }
  }
  const { error } = await (await sb()).from("subscribers").insert({ email });
  if (error) {
    if (error.code === "23505") return { ok: true }; // unique_violation — already subscribed
    throw new ApiError(error.message || "Subscription failed", error.status || 500);
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN: posts
// ═══════════════════════════════════════════════════════════════════════════
export async function adminGetPosts(params) {
  if (IS_VPS) return request(`/posts/admin/all${qs(params)}`);
  const { limit = 50, offset = 0 } = params || {};
  const { data, error } = await (await sb())
    .from("posts").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  sbThrow(error);
  return data ?? [];
}
export async function adminGetPost(id) {
  if (IS_VPS) return request(`/posts/admin/${encodeURIComponent(id)}`);
  const { data, error } = await (await sb())
    .from("posts").select("*").eq("id", id).maybeSingle();
  sbThrow(error);
  if (!data) throw new ApiError("not found", 404);
  return data;
}
export async function adminCreatePost(data) {
  if (IS_VPS) return request(`/posts`, { method: "POST", body: data });
  const { data: row, error } = await (await sb()).from("posts").insert(data).select().single();
  sbThrow(error);
  return row;
}
export async function adminUpdatePost(id, d) {
  if (IS_VPS) return request(`/posts/${id}`, { method: "PATCH", body: d });
  const { data: row, error } = await (await sb()).from("posts").update(d).eq("id", id).select().single();
  sbThrow(error);
  return row;
}
export async function adminDeletePost(id) {
  if (IS_VPS) return request(`/posts/${id}`, { method: "DELETE" });
  const { error } = await (await sb()).from("posts").delete().eq("id", id);
  sbThrow(error);
  return { id };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN: events
// ═══════════════════════════════════════════════════════════════════════════
export async function adminGetEvents(params) {
  if (IS_VPS) return request(`/events/all${qs(params)}`);
  const { limit = 100, offset = 0 } = params || {};
  const { data, error } = await (await sb())
    .from("events").select("*").order("event_date", { ascending: false }).range(offset, offset + limit - 1);
  sbThrow(error);
  return data ?? [];
}
export async function adminGetEvent(id) {
  if (IS_VPS) return request(`/events/admin/${encodeURIComponent(id)}`);
  const { data, error } = await (await sb())
    .from("events").select("*").eq("id", id).maybeSingle();
  sbThrow(error);
  if (!data) throw new ApiError("not found", 404);
  return data;
}
export async function adminCreateEvent(data) {
  if (IS_VPS) return request(`/events`, { method: "POST", body: data });
  const { data: row, error } = await (await sb()).from("events").insert(data).select().single();
  sbThrow(error);
  return row;
}
export async function adminUpdateEvent(id, d) {
  if (IS_VPS) return request(`/events/${id}`, { method: "PUT", body: d });
  const { data: row, error } = await (await sb()).from("events").update(d).eq("id", id).select().single();
  sbThrow(error);
  return row;
}
export async function adminDeleteEvent(id) {
  if (IS_VPS) return request(`/events/${id}`, { method: "DELETE" });
  const { error } = await (await sb()).from("events").delete().eq("id", id);
  sbThrow(error);
  return { id };
}

// ═══════════════════════════════════════════════════════════════════════════
//  EVENT REGISTRATIONS / TICKETING
// ═══════════════════════════════════════════════════════════════════════════

// Public: register for an event. On VPS the server generates the ticket ref
// and sends the confirmation email. On the Supabase target there is no server
// hook, so we generate a ref client-side and insert directly (no email).
export async function registerForEvent(slug, { name, email }) {
  if (IS_VPS) {
    return request(`/events/${encodeURIComponent(slug)}/register`, {
      method: "POST",
      body: { name, email },
    });
  }
  const client = await sb();
  const { data: ev, error: evErr } = await client
    .from("events").select("*").eq("slug", slug).eq("published", true).maybeSingle();
  sbThrow(evErr);
  if (!ev) throw new ApiError("not found", 404);
  if (!ev.registration_open) throw new ApiError("Registration is closed", 403);
  if (ev.capacity != null) {
    const { count, error: cErr } = await client
      .from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", ev.id);
    sbThrow(cErr);
    if ((count ?? 0) >= ev.capacity) throw new ApiError("This event is full", 403);
  }
  const lower = String(email).trim().toLowerCase();
  const { data: dup } = await client
    .from("event_registrations").select("ticket_ref").eq("event_id", ev.id).eq("email", lower).maybeSingle();
  if (dup) throw new ApiError("You're already registered for this event", 409, { ticketRef: dup.ticket_ref });

  const prefix = (String(ev.slug).toUpperCase().replace(/[^A-Z0-9]/g, "") + "XXXX").slice(0, 4);
  const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let rand = "";
  for (let i = 0; i < 6; i++) rand += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  const ticketRef = `CFW-${prefix}-${rand}`;

  const { error: insErr } = await client.from("event_registrations").insert({
    event_id: ev.id, ticket_ref: ticketRef, name: String(name).trim(), email: lower,
  });
  sbThrow(insErr);
  const ticketUrl = `${window.location.origin}/ticket.html?ref=${encodeURIComponent(ticketRef)}`;
  return { ok: true, ticketRef, ticketUrl };
}

// Public: fetch a single ticket's registration + event data by reference.
// Used by ticket.html to render the on-screen ticket.
export async function getTicket(ticketRef) {
  if (IS_VPS) return request(`/tickets/${encodeURIComponent(ticketRef)}/data`);
  const { data, error } = await (await sb())
    .from("event_registrations")
    .select("ticket_ref, name, attended, events(title, slug, event_date, location, location_url, is_online)")
    .eq("ticket_ref", ticketRef)
    .maybeSingle();
  sbThrow(error);
  if (!data) throw new ApiError("not found", 404);
  const ev = data.events || {};
  return {
    ticket_ref: data.ticket_ref,
    name: data.name,
    attended: !!data.attended,
    event_title: ev.title,
    event_slug: ev.slug,
    event_date: ev.event_date,
    location: ev.location,
    location_url: ev.location_url,
    is_online: !!ev.is_online,
  };
}

// Verify a join link and, on success, get the meeting URL to redirect to.
// Gating + automatic attendance marking happen server-side. On success returns
// { ok: true, url }. On failure throws ApiError whose `body` carries the gate
// detail (e.g. { error, startsAt, windowOpensAt, eventTitle }).
//
// This is an online-event feature served only by Express (Target B). On the
// Cloudflare target there is no server to gate the meeting URL, so it errors.
export async function checkJoin(ticketRef) {
  if (IS_VPS) return request(`/join/${encodeURIComponent(ticketRef)}/check`);
  throw new ApiError("Online join links are not available on this deployment.", 501);
}

// Admin: flip registration_open. Returns { registration_open }.
export async function toggleEventRegistration(id) {
  if (IS_VPS) return request(`/events/${encodeURIComponent(id)}/toggle-registration`, { method: "PATCH" });
  const client = await sb();
  const { data: ev, error } = await client.from("events").select("registration_open").eq("id", id).maybeSingle();
  sbThrow(error);
  const next = !ev?.registration_open;
  const { error: uErr } = await client.from("events").update({ registration_open: next }).eq("id", id);
  sbThrow(uErr);
  return { registration_open: next };
}

// Admin: all registrations for an event.
export async function adminGetRegistrations(eventId) {
  if (IS_VPS) return request(`/events/${encodeURIComponent(eventId)}/registrations`);
  const { data, error } = await (await sb())
    .from("event_registrations").select("*").eq("event_id", eventId)
    .order("created_at", { ascending: false });
  sbThrow(error);
  return data ?? [];
}

// Admin: toggle attendance / check-in for a ticket.
export async function markAttendance(ticketRef, attended) {
  if (IS_VPS) {
    return request(`/tickets/${encodeURIComponent(ticketRef)}/attend`, {
      method: "PATCH",
      body: { attended: !!attended },
    });
  }
  const { data, error } = await (await sb())
    .from("event_registrations")
    .update({ attended: !!attended, checked_in_at: attended ? new Date().toISOString() : null })
    .eq("ticket_ref", ticketRef).select().single();
  sbThrow(error);
  return data;
}

// Admin: { total, attended, capacity }.
export async function adminGetAttendanceStats(eventId) {
  if (IS_VPS) {
    const regs = await request(`/events/${encodeURIComponent(eventId)}/registrations`);
    const ev = await adminGetEvent(eventId);
    const list = Array.isArray(regs) ? regs : [];
    return { total: list.length, attended: list.filter((r) => r.attended).length, capacity: ev?.capacity ?? null };
  }
  const client = await sb();
  const { data, error } = await client.from("event_registrations").select("attended").eq("event_id", eventId);
  sbThrow(error);
  const ev = await adminGetEvent(eventId);
  const rows = data ?? [];
  return { total: rows.length, attended: rows.filter((r) => r.attended).length, capacity: ev?.capacity ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN: products
// ═══════════════════════════════════════════════════════════════════════════
export async function adminGetProducts(params) {
  if (IS_VPS) return request(`/products/admin/all${qs(params)}`);
  const { limit = 50, offset = 0 } = params || {};
  const { data, error } = await (await sb())
    .from("products").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  sbThrow(error);
  return data ?? [];
}
export async function adminGetProduct(id) {
  if (IS_VPS) return request(`/products/admin/${encodeURIComponent(id)}`);
  const { data, error } = await (await sb())
    .from("products").select("*").eq("id", id).maybeSingle();
  sbThrow(error);
  if (!data) throw new ApiError("not found", 404);
  return data;
}
export async function adminCreateProduct(data) {
  if (IS_VPS) return request(`/products`, { method: "POST", body: data });
  const { data: row, error } = await (await sb()).from("products").insert(data).select().single();
  sbThrow(error);
  return row;
}
export async function adminUpdateProduct(id, d) {
  if (IS_VPS) return request(`/products/${id}`, { method: "PATCH", body: d });
  const { data: row, error } = await (await sb()).from("products").update(d).eq("id", id).select().single();
  sbThrow(error);
  return row;
}
export async function adminDeleteProduct(id) {
  if (IS_VPS) return request(`/products/${id}`, { method: "DELETE" });
  const { error } = await (await sb()).from("products").delete().eq("id", id);
  sbThrow(error);
  return { id };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN: orders
// ═══════════════════════════════════════════════════════════════════════════
export async function adminGetOrders(params) {
  if (IS_VPS) return request(`/orders${qs(params)}`);
  const { status, limit = 50, offset = 0 } = params || {};
  let q = (await sb()).from("orders").select("*");
  if (status) q = q.eq("status", status);
  const { data, error } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  sbThrow(error);
  return data ?? [];
}
export async function adminUpdateOrderStatus(id, status) {
  if (IS_VPS) return request(`/orders/${id}/status`, { method: "PATCH", body: { status } });
  const { data, error } = await (await sb()).from("orders").update({ status }).eq("id", id).select().single();
  sbThrow(error);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN: settings
// ═══════════════════════════════════════════════════════════════════════════
export async function adminUpdateSetting(key, value) {
  if (IS_VPS) return request(`/settings/${encodeURIComponent(key)}`, { method: "PUT", body: { value } });
  const { error } = await (await sb())
    .from("site_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  sbThrow(error);
  return { key, value };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN: nav
// ═══════════════════════════════════════════════════════════════════════════
export async function adminGetNavItems() {
  if (IS_VPS) return request(`/nav/admin/all`);
  const { data, error } = await (await sb()).from("nav_items").select("*").order("position", { ascending: true });
  sbThrow(error);
  return data ?? [];
}
export async function adminCreateNavItem(data) {
  if (IS_VPS) return request(`/nav`, { method: "POST", body: data });
  const { data: row, error } = await (await sb()).from("nav_items").insert(data).select().single();
  sbThrow(error);
  return row;
}
export async function adminUpdateNavItem(id, d) {
  if (IS_VPS) return request(`/nav/${id}`, { method: "PATCH", body: d });
  const { data: row, error } = await (await sb()).from("nav_items").update(d).eq("id", id).select().single();
  sbThrow(error);
  return row;
}
export async function adminDeleteNavItem(id) {
  if (IS_VPS) return request(`/nav/${id}`, { method: "DELETE" });
  const { error } = await (await sb()).from("nav_items").delete().eq("id", id);
  sbThrow(error);
  return { id };
}
export async function adminReorderNavItems(ids) {
  if (IS_VPS) return request(`/nav/reorder`, { method: "POST", body: { ids } });
  const client = await sb();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await client.from("nav_items").update({ position: i + 1 }).eq("id", ids[i]);
    sbThrow(error);
  }
  return adminGetNavItems();
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN: hero slides
// ═══════════════════════════════════════════════════════════════════════════
export async function adminGetHeroSlides() {
  if (IS_VPS) return request(`/slides/all`);
  const { data, error } = await (await sb()).from("hero_slides").select("*").order("position", { ascending: true });
  sbThrow(error);
  return data ?? [];
}
export async function adminCreateHeroSlide(data) {
  if (IS_VPS) return request(`/slides`, { method: "POST", body: data });
  const { data: row, error } = await (await sb()).from("hero_slides").insert(data).select().single();
  sbThrow(error);
  return row;
}
export async function adminUpdateHeroSlide(id, d) {
  if (IS_VPS) return request(`/slides/${id}`, { method: "PUT", body: d });
  const { data: row, error } = await (await sb()).from("hero_slides").update(d).eq("id", id).select().single();
  sbThrow(error);
  return row;
}
export async function adminDeleteHeroSlide(id) {
  if (IS_VPS) return request(`/slides/${id}`, { method: "DELETE" });
  const { error } = await (await sb()).from("hero_slides").delete().eq("id", id);
  sbThrow(error);
  return { id };
}
export async function adminReorderHeroSlides(ids) {
  if (IS_VPS) return request(`/slides/reorder`, { method: "POST", body: { ids } });
  const client = await sb();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await client.from("hero_slides").update({ position: i + 1 }).eq("id", ids[i]);
    sbThrow(error);
  }
  return adminGetHeroSlides();
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN: file upload
// ═══════════════════════════════════════════════════════════════════════════
// Returns { url } on both targets.
//   VPS        → POST /upload (local disk via the Express upload route).
//   Cloudflare → Supabase Storage bucket "uploads", public URL.
export async function adminUploadFile(file) {
  if (IS_VPS) {
    const fd = new FormData();
    fd.append("file", file);

    const send = () => {
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      // credentials: include so the httpOnly refresh cookie rides along.
      return fetch(`${BASE_URL}/upload`, { method: "POST", headers, body: fd, credentials: "include" });
    };

    let res = await send();
    if (res.status === 401) {
      // Try one refresh, then replay the upload once.
      const newToken = await tryRefresh();
      if (newToken) {
        res = await send();
      } else {
        await failSession();
        throw new ApiError("Your session has expired. Please sign in again.", 401);
      }
    }
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
      throw new ApiError(msg, res.status);
    }
    return res.json();
  }

  const client = await sb();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const objectPath = `${Date.now()}-${safeName}`;
  const { error } = await client.storage.from("uploads").upload(objectPath, file, {
    cacheControl: "31536000",
    upsert: false,
  });
  sbThrow(error);
  const { data } = client.storage.from("uploads").getPublicUrl(objectPath);
  return { url: data.publicUrl };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN: subscribers
// ═══════════════════════════════════════════════════════════════════════════
// Backs the subscribers panel on /admin/settings. Returns [{ id, email, created_at }].
export async function adminGetSubscribers() {
  if (IS_VPS) return request(`/subscribers`);
  const { data, error } = await (await sb())
    .from("subscribers").select("id, email, created_at")
    .order("created_at", { ascending: false });
  sbThrow(error);
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN: accounts
// ═══════════════════════════════════════════════════════════════════════════
// Backs the /admin/admins account manager. Shapes mirror the Express routes.
export async function adminListAdmins() {
  if (IS_VPS) return request(`/auth/admins`);
  const { data, error } = await (await sb())
    .from("admin_users").select("id, email, created_at")
    .order("created_at", { ascending: true });
  sbThrow(error);
  return data ?? [];
}
// Create a new admin. Returns { ok, user: { id, email } } or throws.
export async function adminRegister(email, password) {
  if (IS_VPS) return request(`/auth/register`, { method: "POST", body: { email, password } });
  // Passwords are bcrypt-hashed server-side, which cannot happen in the
  // browser — on Cloudflare admins are provisioned through Supabase Auth.
  throw new ApiError("Admin registration runs server-side and is unavailable on this deployment target.", 400);
}
export async function adminDeleteAdmin(id) {
  if (IS_VPS) return request(`/auth/admins/${encodeURIComponent(id)}`, { method: "DELETE" });
  const { error } = await (await sb()).from("admin_users").delete().eq("id", id);
  sbThrow(error);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH (low-level)
// ═══════════════════════════════════════════════════════════════════════════
// Admin pages use assets/js/auth.js, which wraps these into a single
// target-agnostic surface. They are kept here so the data client owns the
// transport for both targets.
export async function login(email, password) {
  if (IS_VPS) {
    const out = await request(`/auth/login`, { method: "POST", body: { email, password } });
    if (out?.token) setToken(out.token);
    return out;
  }
  const { data, error } = await (await sb()).auth.signInWithPassword({ email, password });
  if (error) throw new ApiError(error.message || "Invalid credentials", error.status || 401);
  return data;
}

export async function logout() {
  if (IS_VPS) {
    try { await request(`/auth/logout`, { method: "POST" }); } catch {}
    clearToken();
    return;
  }
  await (await sb()).auth.signOut();
}

export async function me() {
  if (IS_VPS) return request(`/auth/me`);
  const { data, error } = await (await sb()).auth.getUser();
  if (error) throw new ApiError(error.message || "Not authenticated", error.status || 401);
  return data?.user ?? null;
}

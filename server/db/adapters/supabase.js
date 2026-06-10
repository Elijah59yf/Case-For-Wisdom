import { createClient } from "@supabase/supabase-js";

let _client;
function client() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

function throwIf(error) { if (error) throw new Error(error.message); }

// ── posts ────────────────────────────────────────────────────────────
async function getPosts({ limit = 20, offset = 0, page = 1 } = {}) {
  const { data, error, count } = await client()
    .from("posts")
    .select("*", { count: "exact" })
    .eq("published", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  throwIf(error);
  return { data: data ?? [], total: count ?? 0, page: Number(page), limit: Number(limit) };
}
async function getAllPosts({ limit = 50, offset = 0 } = {}) {
  const { data, error } = await client()
    .from("posts").select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  throwIf(error);
  return data;
}
async function getPostBySlug(slug) {
  const { data, error } = await client()
    .from("posts").select("*").eq("slug", slug).maybeSingle();
  throwIf(error);
  return data;
}
async function getPostById(id) {
  const { data, error } = await client()
    .from("posts").select("*").eq("id", id).maybeSingle();
  throwIf(error);
  return data;
}
async function createPost(data) {
  const { data: row, error } = await client().from("posts").insert(data).select().single();
  throwIf(error);
  return row;
}
async function updatePost(id, data) {
  const { data: row, error } = await client().from("posts").update(data).eq("id", id).select().single();
  throwIf(error);
  return row;
}
async function deletePost(id) {
  const { error } = await client().from("posts").delete().eq("id", id);
  throwIf(error);
  return { id };
}

// ── events ───────────────────────────────────────────────────────────
// getEvents returns published events from the start of today onward,
// soonest-first. The cutoff is midnight today in ISO form.
async function getEvents({ limit = 50, offset = 0 } = {}) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  const { data, error } = await client()
    .from("events").select("*")
    .eq("published", true)
    .gte("event_date", cutoff.toISOString())
    .order("event_date", { ascending: true })
    .range(offset, offset + limit - 1);
  throwIf(error);
  return data ?? [];
}
async function getAllEvents({ limit = 100, offset = 0 } = {}) {
  const { data, error } = await client()
    .from("events").select("*")
    .order("event_date", { ascending: false })
    .range(offset, offset + limit - 1);
  throwIf(error);
  return data ?? [];
}
async function getPastEvents() {
  const { data, error } = await client()
    .from("events").select("*")
    .eq("published", true)
    .lt("event_date", new Date().toISOString())
    .order("event_date", { ascending: false })
    .limit(20);
  throwIf(error);
  return data ?? [];
}
async function getEventBySlug(slug) {
  const { data, error } = await client()
    .from("events").select("*").eq("slug", slug).maybeSingle();
  throwIf(error);
  return data;
}
async function getEventById(id) {
  const { data, error } = await client()
    .from("events").select("*").eq("id", id).maybeSingle();
  throwIf(error);
  return data;
}
async function createEvent(data) {
  const { data: row, error } = await client().from("events").insert(data).select().single();
  throwIf(error);
  return row;
}
async function updateEvent(id, data) {
  const { data: row, error } = await client().from("events").update(data).eq("id", id).select().single();
  throwIf(error);
  return row;
}
async function deleteEvent(id) {
  const { error } = await client().from("events").delete().eq("id", id);
  throwIf(error);
  return { id };
}

// ── event registrations ───────────────────────────────────────────────
async function getEventRegistrations(eventId) {
  const { data, error } = await client()
    .from("event_registrations").select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  throwIf(error);
  return data ?? [];
}
async function getRegistrationByTicketRef(ticketRef) {
  const { data, error } = await client()
    .from("event_registrations")
    .select("*, events(title, slug, event_date, location, location_url, is_online)")
    .eq("ticket_ref", ticketRef)
    .maybeSingle();
  throwIf(error);
  if (!data) return null;
  const ev = data.events || {};
  const { events, ...reg } = data;
  return {
    ...reg,
    event_title: ev.title,
    event_slug: ev.slug,
    event_date: ev.event_date,
    location: ev.location,
    location_url: ev.location_url,
    is_online: ev.is_online,
  };
}
async function createRegistration({ eventId, ticketRef, name, email, paid = false, amountPaid = 0 }) {
  const { data, error } = await client()
    .from("event_registrations")
    .insert({ event_id: eventId, ticket_ref: ticketRef, name, email, paid, amount_paid: amountPaid })
    .select().single();
  throwIf(error);
  return data;
}
async function markAttended(ticketRef, attended = true) {
  const { error } = await client()
    .from("event_registrations")
    .update({ attended, checked_in_at: attended ? new Date().toISOString() : null })
    .eq("ticket_ref", ticketRef);
  throwIf(error);
  return getRegistrationByTicketRef(ticketRef);
}
// Mark attendance from a join-link visit — only if not already checked in, so
// an existing check-in time (e.g. set by an admin at the door) is preserved.
async function markAttendedByTicketRef(ticketRef) {
  const { error } = await client()
    .from("event_registrations")
    .update({ attended: true, checked_in_at: new Date().toISOString() })
    .eq("ticket_ref", ticketRef)
    .eq("attended", false);
  throwIf(error);
  return getRegistrationByTicketRef(ticketRef);
}
async function countRegistrations(eventId) {
  const { count, error } = await client()
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  throwIf(error);
  return count ?? 0;
}
async function getEventAttendanceStats(eventId) {
  const { data, error } = await client()
    .from("event_registrations").select("attended")
    .eq("event_id", eventId);
  throwIf(error);
  const rows = data ?? [];
  const event = await getEventById(eventId);
  return {
    total: rows.length,
    attended: rows.filter((r) => r.attended).length,
    capacity: event ? event.capacity ?? null : null,
  };
}
async function getRegistrationByEventAndEmail(eventId, email) {
  const { data, error } = await client()
    .from("event_registrations").select("*")
    .eq("event_id", eventId).eq("email", email)
    .maybeSingle();
  throwIf(error);
  return data;
}

// ── products ─────────────────────────────────────────────────────────
async function getProducts({ limit = 20, offset = 0 } = {}) {
  const { data, error } = await client()
    .from("products").select("*").eq("in_stock", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  throwIf(error);
  return data;
}
async function getAllProducts({ limit = 50, offset = 0 } = {}) {
  const { data, error } = await client()
    .from("products").select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  throwIf(error);
  return data;
}
async function getProductById(id) {
  const { data, error } = await client()
    .from("products").select("*").eq("id", id).maybeSingle();
  throwIf(error);
  return data;
}
async function createProduct(data) {
  const { data: row, error } = await client().from("products").insert(data).select().single();
  throwIf(error);
  return row;
}
async function updateProduct(id, data) {
  const { data: row, error } = await client().from("products").update(data).eq("id", id).select().single();
  throwIf(error);
  return row;
}
async function deleteProduct(id) {
  const { error } = await client().from("products").delete().eq("id", id);
  throwIf(error);
  return { id };
}

// ── orders ───────────────────────────────────────────────────────────
async function createOrder(data) {
  const { data: row, error } = await client().from("orders").insert(data).select().single();
  throwIf(error);
  return row;
}
async function getOrders({ status, limit = 50, offset = 0 } = {}) {
  let q = client().from("orders").select("*");
  if (status) q = q.eq("status", status);
  const { data, error } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  throwIf(error);
  return data;
}
async function getOrderById(id) {
  const { data, error } = await client().from("orders").select("*").eq("id", id).maybeSingle();
  throwIf(error);
  return data;
}
async function updateOrderStatus(id, status) {
  const { data, error } = await client().from("orders").update({ status }).eq("id", id).select().single();
  throwIf(error);
  return data;
}

// ── settings ─────────────────────────────────────────────────────────
async function getSettings() {
  const { data, error } = await client().from("site_settings").select("key, value");
  throwIf(error);
  const out = {};
  for (const r of data || []) out[r.key] = r.value;
  return out;
}
async function updateSetting(key, value) {
  const { error } = await client().from("site_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  throwIf(error);
  return { key, value };
}

// ── nav ──────────────────────────────────────────────────────────────
async function getNavItems() {
  const { data, error } = await client()
    .from("nav_items").select("*").eq("visible", true)
    .order("position", { ascending: true });
  throwIf(error);
  return data;
}
async function getAllNavItems() {
  const { data, error } = await client()
    .from("nav_items").select("*").order("position", { ascending: true });
  throwIf(error);
  return data;
}
async function createNavItem(data) {
  const { data: row, error } = await client().from("nav_items").insert(data).select().single();
  throwIf(error);
  return row;
}
async function updateNavItem(id, data) {
  const { data: row, error } = await client().from("nav_items").update(data).eq("id", id).select().single();
  throwIf(error);
  return row;
}
async function deleteNavItem(id) {
  const { error } = await client().from("nav_items").delete().eq("id", id);
  throwIf(error);
  return { id };
}
async function reorderNavItems(ids) {
  for (let i = 0; i < ids.length; i++) {
    const { error } = await client().from("nav_items").update({ position: i + 1 }).eq("id", ids[i]);
    throwIf(error);
  }
  return getAllNavItems();
}

// ── hero_slides ──────────────────────────────────────────────────────
async function getHeroSlides() {
  const { data, error } = await client()
    .from("hero_slides").select("*").eq("active", true)
    .order("position", { ascending: true });
  throwIf(error);
  return data;
}
async function getAllHeroSlides() {
  const { data, error } = await client()
    .from("hero_slides").select("*").order("position", { ascending: true });
  throwIf(error);
  return data;
}
async function createHeroSlide(data) {
  const { data: row, error } = await client().from("hero_slides").insert(data).select().single();
  throwIf(error);
  return row;
}
async function updateHeroSlide(id, data) {
  const { data: row, error } = await client().from("hero_slides").update(data).eq("id", id).select().single();
  throwIf(error);
  return row;
}
async function deleteHeroSlide(id) {
  const { error } = await client().from("hero_slides").delete().eq("id", id);
  throwIf(error);
  return { id };
}
async function reorderHeroSlides(ids) {
  for (let i = 0; i < ids.length; i++) {
    const { error } = await client().from("hero_slides").update({ position: i + 1 }).eq("id", ids[i]);
    throwIf(error);
  }
  return getAllHeroSlides();
}

// ── auth helpers ─────────────────────────────────────────────────────
// Supabase manages admin auth via Supabase Auth in production. This
// helper exists so the route can fall back to a stored hash row if the
// project chooses to keep admin_users in Postgres as well.
async function getAdminByEmail(email) {
  const { data, error } = await client()
    .from("admin_users").select("*").eq("email", email).maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data || null;
}
async function getAdminById(id) {
  const { data, error } = await client()
    .from("admin_users").select("*").eq("id", id).maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data || null;
}
// List every admin without the password hash (account manager table).
async function getAllAdmins() {
  const { data, error } = await client()
    .from("admin_users").select("id, email, created_at")
    .order("created_at", { ascending: true });
  throwIf(error);
  return data ?? [];
}
async function createAdmin({ email, password_hash }) {
  const { data, error } = await client()
    .from("admin_users").insert({ email, password_hash })
    .select("id, email, created_at").single();
  throwIf(error);
  return data;
}
async function deleteAdminById(id) {
  const { error } = await client().from("admin_users").delete().eq("id", id);
  throwIf(error);
  return { id };
}

// ── refresh tokens ───────────────────────────────────────────────────
// Mirrors the MariaDB adapter signatures. expires_at may be a Date or ISO
// string; Postgres timestamptz accepts an ISO string.
async function saveRefreshToken({ user_id, token_hash, expires_at }) {
  const iso = expires_at instanceof Date ? expires_at.toISOString() : expires_at;
  const { error } = await client()
    .from("refresh_tokens")
    .insert({ user_id, token_hash, expires_at: iso });
  throwIf(error);
  return { user_id, token_hash, expires_at: iso };
}
async function findRefreshToken(token_hash) {
  const { data, error } = await client()
    .from("refresh_tokens").select("*").eq("token_hash", token_hash).maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data || null;
}
async function deleteRefreshToken(token_hash) {
  const { error } = await client()
    .from("refresh_tokens").delete().eq("token_hash", token_hash);
  throwIf(error);
  return { token_hash };
}

// ── subscribers ──────────────────────────────────────────────────────
async function addSubscriber(email) {
  const { error } = await client().from("subscribers").insert({ email });
  // 23505 = unique_violation: already subscribed. Stay silent.
  if (error && error.code !== "23505") throw new Error(error.message);
  return { ok: true };
}
async function getSubscribers() {
  const { data, error } = await client()
    .from("subscribers").select("id, email, created_at")
    .order("created_at", { ascending: false });
  throwIf(error);
  return data ?? [];
}

export default {
  getPosts, getAllPosts, getPostBySlug, getPostById, createPost, updatePost, deletePost,
  getEvents, getAllEvents, getPastEvents, getEventBySlug, getEventById, createEvent, updateEvent, deleteEvent,
  getEventRegistrations, getRegistrationByTicketRef, createRegistration, markAttended,
  markAttendedByTicketRef,
  countRegistrations, getEventAttendanceStats, getRegistrationByEventAndEmail,
  getProducts, getAllProducts, getProductById, createProduct, updateProduct, deleteProduct,
  createOrder, getOrders, getOrderById, updateOrderStatus,
  getSettings, updateSetting,
  getNavItems, getAllNavItems, createNavItem, updateNavItem, deleteNavItem, reorderNavItems,
  getHeroSlides, getAllHeroSlides, createHeroSlide, updateHeroSlide, deleteHeroSlide, reorderHeroSlides,
  getAdminByEmail, getAdminById, getAllAdmins, createAdmin, deleteAdminById,
  saveRefreshToken, findRefreshToken, deleteRefreshToken,
  addSubscriber, getSubscribers,
};

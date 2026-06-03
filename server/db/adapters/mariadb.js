import { randomUUID } from "node:crypto";
import { getPool } from "../mariadb-pool.js";

const pool = () => getPool();

function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function rowToPost(r) {
  if (!r) return null;
  return { ...r, published: !!r.published };
}
function rowToProduct(r) {
  if (!r) return null;
  return {
    ...r,
    in_stock: !!r.in_stock,
    images: parseJson(r.images, []),
    price: Number(r.price),
  };
}
function rowToOrder(r) {
  if (!r) return null;
  return {
    ...r,
    items: parseJson(r.items, []),
    shipping_address: parseJson(r.shipping_address, null),
    total: Number(r.total),
  };
}
function rowToNav(r) {
  if (!r) return null;
  return { ...r, visible: !!r.visible, opens_new: !!r.opens_new };
}
function rowToSlide(r) {
  if (!r) return null;
  return { ...r, active: !!r.active };
}

// ── posts ────────────────────────────────────────────────────────────
async function getPosts(opts = {}) {
  const { limit = 20, offset = 0, page = 1 } = opts;
  const [rows] = await pool().query(
    "SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [Number(limit), Number(offset)]
  );
  const [[{ total }]] = await pool().query(
    "SELECT COUNT(*) AS total FROM posts WHERE published = 1"
  );
  return { data: rows.map(rowToPost), total: Number(total), page: Number(page), limit: Number(limit) };
}
async function getAllPosts(opts = {}) {
  const { limit = 50, offset = 0 } = opts;
  const [rows] = await pool().query(
    "SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [Number(limit), Number(offset)]
  );
  return rows.map(rowToPost);
}
async function getPostBySlug(slug) {
  const [rows] = await pool().query("SELECT * FROM posts WHERE slug = ? LIMIT 1", [slug]);
  return rowToPost(rows[0]);
}
async function getPostById(id) {
  const [rows] = await pool().query("SELECT * FROM posts WHERE id = ? LIMIT 1", [id]);
  return rowToPost(rows[0]);
}
async function createPost(data) {
  const { id, title, slug, excerpt = null, body = null, cover_url = null, category = null, published = false } = data;
  await pool().query(
    `INSERT INTO posts (id, title, slug, excerpt, body, cover_url, category, published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, title, slug, excerpt, body, cover_url, category, published ? 1 : 0]
  );
  const [rows] = await pool().query("SELECT * FROM posts WHERE id = ?", [id]);
  return rowToPost(rows[0]);
}
async function updatePost(id, data) {
  const fields = [];
  const values = [];
  for (const k of ["title", "slug", "excerpt", "body", "cover_url", "category"]) {
    if (k in data) { fields.push(`${k} = ?`); values.push(data[k]); }
  }
  if ("published" in data) { fields.push("published = ?"); values.push(data.published ? 1 : 0); }
  if (!fields.length) {
    const [rows] = await pool().query("SELECT * FROM posts WHERE id = ?", [id]);
    return rowToPost(rows[0]);
  }
  values.push(id);
  await pool().query(`UPDATE posts SET ${fields.join(", ")} WHERE id = ?`, values);
  const [rows] = await pool().query("SELECT * FROM posts WHERE id = ?", [id]);
  return rowToPost(rows[0]);
}
async function deletePost(id) {
  await pool().query("DELETE FROM posts WHERE id = ?", [id]);
  return { id };
}

// ── products ─────────────────────────────────────────────────────────
async function getProducts(opts = {}) {
  const { limit = 20, offset = 0 } = opts;
  const [rows] = await pool().query(
    "SELECT * FROM products WHERE in_stock = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [Number(limit), Number(offset)]
  );
  return rows.map(rowToProduct);
}
async function getAllProducts(opts = {}) {
  const { limit = 50, offset = 0 } = opts;
  const [rows] = await pool().query(
    "SELECT * FROM products ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [Number(limit), Number(offset)]
  );
  return rows.map(rowToProduct);
}
async function getProductById(id) {
  const [rows] = await pool().query("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);
  return rowToProduct(rows[0]);
}
async function createProduct(data) {
  const {
    id, name, slug, description = null, price,
    images = [], category = null, in_stock = true,
    stock_count = 0, stripe_price_id = null,
  } = data;
  await pool().query(
    `INSERT INTO products (id, name, slug, description, price, images, category, in_stock, stock_count, stripe_price_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, slug, description, price, JSON.stringify(images), category, in_stock ? 1 : 0, stock_count, stripe_price_id]
  );
  return getProductById(id);
}
async function updateProduct(id, data) {
  const fields = [];
  const values = [];
  for (const k of ["name", "slug", "description", "price", "category", "stock_count", "stripe_price_id"]) {
    if (k in data) { fields.push(`${k} = ?`); values.push(data[k]); }
  }
  if ("images" in data) { fields.push("images = ?"); values.push(JSON.stringify(data.images)); }
  if ("in_stock" in data) { fields.push("in_stock = ?"); values.push(data.in_stock ? 1 : 0); }
  if (!fields.length) return getProductById(id);
  values.push(id);
  await pool().query(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`, values);
  return getProductById(id);
}
async function deleteProduct(id) {
  await pool().query("DELETE FROM products WHERE id = ?", [id]);
  return { id };
}

// ── orders ───────────────────────────────────────────────────────────
async function createOrder(data) {
  const {
    id, stripe_payment_intent_id = null,
    customer_email = null, customer_name = null,
    shipping_address = null, items = [], total, status = "pending",
  } = data;
  await pool().query(
    `INSERT INTO orders (id, stripe_payment_intent_id, customer_email, customer_name, shipping_address, items, total, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, stripe_payment_intent_id, customer_email, customer_name,
     shipping_address ? JSON.stringify(shipping_address) : null,
     JSON.stringify(items), total, status]
  );
  return getOrderById(id);
}
async function getOrders(opts = {}) {
  const { status, limit = 50, offset = 0 } = opts;
  let sql = "SELECT * FROM orders";
  const args = [];
  if (status) { sql += " WHERE status = ?"; args.push(status); }
  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  args.push(Number(limit), Number(offset));
  const [rows] = await pool().query(sql, args);
  return rows.map(rowToOrder);
}
async function getOrderById(id) {
  const [rows] = await pool().query("SELECT * FROM orders WHERE id = ? LIMIT 1", [id]);
  return rowToOrder(rows[0]);
}
async function updateOrderStatus(id, status) {
  await pool().query("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
  return getOrderById(id);
}

// ── settings ─────────────────────────────────────────────────────────
async function getSettings() {
  const [rows] = await pool().query("SELECT `key`, value FROM site_settings");
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
async function updateSetting(key, value) {
  await pool().query(
    "INSERT INTO site_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [key, value]
  );
  return { key, value };
}

// ── nav ──────────────────────────────────────────────────────────────
async function getNavItems() {
  const [rows] = await pool().query(
    "SELECT * FROM nav_items WHERE visible = 1 ORDER BY position ASC, created_at ASC"
  );
  return rows.map(rowToNav);
}
async function getAllNavItems() {
  const [rows] = await pool().query(
    "SELECT * FROM nav_items ORDER BY position ASC, created_at ASC"
  );
  return rows.map(rowToNav);
}
async function createNavItem(data) {
  const { id, label, url, position = 0, visible = true, opens_new = false } = data;
  await pool().query(
    `INSERT INTO nav_items (id, label, url, position, visible, opens_new)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, label, url, position, visible ? 1 : 0, opens_new ? 1 : 0]
  );
  const [rows] = await pool().query("SELECT * FROM nav_items WHERE id = ?", [id]);
  return rowToNav(rows[0]);
}
async function updateNavItem(id, data) {
  const fields = [];
  const values = [];
  for (const k of ["label", "url", "position"]) {
    if (k in data) { fields.push(`${k} = ?`); values.push(data[k]); }
  }
  if ("visible" in data) { fields.push("visible = ?"); values.push(data.visible ? 1 : 0); }
  if ("opens_new" in data) { fields.push("opens_new = ?"); values.push(data.opens_new ? 1 : 0); }
  if (!fields.length) {
    const [rows] = await pool().query("SELECT * FROM nav_items WHERE id = ?", [id]);
    return rowToNav(rows[0]);
  }
  values.push(id);
  await pool().query(`UPDATE nav_items SET ${fields.join(", ")} WHERE id = ?`, values);
  const [rows] = await pool().query("SELECT * FROM nav_items WHERE id = ?", [id]);
  return rowToNav(rows[0]);
}
async function deleteNavItem(id) {
  await pool().query("DELETE FROM nav_items WHERE id = ?", [id]);
  return { id };
}
async function reorderNavItems(ids) {
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < ids.length; i++) {
      await conn.query("UPDATE nav_items SET position = ? WHERE id = ?", [i + 1, ids[i]]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getAllNavItems();
}

// ── hero_slides ──────────────────────────────────────────────────────
async function getHeroSlides() {
  const [rows] = await pool().query(
    "SELECT * FROM hero_slides WHERE active = 1 ORDER BY position ASC, created_at ASC"
  );
  return rows.map(rowToSlide);
}
async function getAllHeroSlides() {
  const [rows] = await pool().query(
    "SELECT * FROM hero_slides ORDER BY position ASC, created_at ASC"
  );
  return rows.map(rowToSlide);
}
async function createHeroSlide(data) {
  const { id, image_url, caption = null, alt_text = null, position = 0, active = true } = data;
  await pool().query(
    `INSERT INTO hero_slides (id, image_url, caption, alt_text, position, active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, image_url, caption, alt_text, position, active ? 1 : 0]
  );
  const [rows] = await pool().query("SELECT * FROM hero_slides WHERE id = ?", [id]);
  return rowToSlide(rows[0]);
}
async function updateHeroSlide(id, data) {
  const fields = [];
  const values = [];
  for (const k of ["image_url", "caption", "alt_text"]) {
    if (k in data) { fields.push(`${k} = ?`); values.push(data[k]); }
  }
  if ("position" in data) { fields.push("position = ?"); values.push(+data.position); }
  if ("active" in data) { fields.push("active = ?"); values.push(data.active ? 1 : 0); }
  if (fields.length) {
    values.push(id);
    await pool().query(`UPDATE hero_slides SET ${fields.join(", ")} WHERE id = ?`, values);
  }
  const [rows] = await pool().query("SELECT * FROM hero_slides WHERE id = ?", [id]);
  return rowToSlide(rows[0]);
}
async function deleteHeroSlide(id) {
  await pool().query("DELETE FROM hero_slides WHERE id = ?", [id]);
  return { id };
}
async function reorderHeroSlides(ids) {
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < ids.length; i++) {
      await conn.query("UPDATE hero_slides SET position = ? WHERE id = ?", [i + 1, ids[i]]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getAllHeroSlides();
}

// ── auth helpers (admin users) ───────────────────────────────────────
async function getAdminByEmail(email) {
  const [rows] = await pool().query("SELECT * FROM admin_users WHERE email = ? LIMIT 1", [email]);
  return rows[0] || null;
}
async function getAdminById(id) {
  const [rows] = await pool().query("SELECT * FROM admin_users WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}
// List every admin without the password hash (account manager table).
async function getAllAdmins() {
  const [rows] = await pool().query(
    "SELECT id, email, created_at FROM admin_users ORDER BY created_at ASC"
  );
  return rows;
}
async function createAdmin({ email, password_hash }) {
  const id = randomUUID();
  await pool().query(
    "INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)",
    [id, email, password_hash]
  );
  const [rows] = await pool().query(
    "SELECT id, email, created_at FROM admin_users WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0];
}
async function deleteAdminById(id) {
  await pool().query("DELETE FROM admin_users WHERE id = ?", [id]);
  return { id };
}

// ── refresh tokens ───────────────────────────────────────────────────
async function saveRefreshToken({ user_id, token_hash, expires_at }) {
  await pool().query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [user_id, token_hash, expires_at]
  );
  return { user_id, token_hash, expires_at };
}
async function findRefreshToken(token_hash) {
  const [rows] = await pool().query(
    "SELECT * FROM refresh_tokens WHERE token_hash = ? LIMIT 1",
    [token_hash]
  );
  return rows[0] || null;
}
async function deleteRefreshToken(token_hash) {
  await pool().query("DELETE FROM refresh_tokens WHERE token_hash = ?", [token_hash]);
  return { token_hash };
}

// ── subscribers ──────────────────────────────────────────────────────
async function addSubscriber(email) {
  try {
    await pool().query("INSERT INTO subscribers (id, email) VALUES (UUID(), ?)", [email]);
  } catch (err) {
    // Already subscribed — stay silent so we never reveal list membership.
    if (err?.code === "ER_DUP_ENTRY") return { ok: true };
    throw err;
  }
  return { ok: true };
}
async function getSubscribers() {
  const [rows] = await pool().query(
    "SELECT id, email, created_at FROM subscribers ORDER BY created_at DESC"
  );
  return rows;
}

export default {
  getPosts, getAllPosts, getPostBySlug, getPostById, createPost, updatePost, deletePost,
  getProducts, getAllProducts, getProductById, createProduct, updateProduct, deleteProduct,
  createOrder, getOrders, getOrderById, updateOrderStatus,
  getSettings, updateSetting,
  getNavItems, getAllNavItems, createNavItem, updateNavItem, deleteNavItem, reorderNavItems,
  getHeroSlides, getAllHeroSlides, createHeroSlide, updateHeroSlide, deleteHeroSlide, reorderHeroSlides,
  getAdminByEmail, getAdminById, getAllAdmins, createAdmin, deleteAdminById,
  saveRefreshToken, findRefreshToken, deleteRefreshToken,
  addSubscriber, getSubscribers,
};

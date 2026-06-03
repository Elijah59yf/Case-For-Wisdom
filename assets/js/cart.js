// cart.js — the single owner of cart state (CLAUDE.md §8.1).
//
// Cart lives in localStorage under one key. No other module reads or writes
// that key directly; everyone calls the functions exported here. Every mutation
// dispatches a `cart:change` event on window so the nav bubble (site.js) and any
// open cart view can re-render.

const CART_KEY = "acfw_cart";

/** Read and parse the raw cart array. Always returns a clean array. */
function read() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Normalize each line so callers can trust the shape.
    return parsed
      .filter((l) => l && l.id != null)
      .map((l) => ({
        id: String(l.id),
        name: String(l.name ?? ""),
        price: Number(l.price) || 0,
        qty: Math.max(1, parseInt(l.qty, 10) || 1),
        image: l.image ?? null,
      }));
  } catch {
    return [];
  }
}

/** Persist the cart array and broadcast a change. */
function write(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    /* storage may be unavailable (private mode) — fail quietly */
  }
  try {
    window.dispatchEvent(new CustomEvent("cart:change", { detail: { count: count(items) } }));
  } catch {}
}

function count(items) {
  return items.reduce((n, l) => n + (parseInt(l.qty, 10) || 0), 0);
}

// ── Public API ─────────────────────────────────────────────────────────────

/** @returns {{id:string,name:string,price:number,qty:number,image:string|null}[]} */
export function getCart() {
  return read();
}

/**
 * Add a product to the cart, or increment its quantity if already present.
 * @param {{id:string|number, name:string, price:number|string, images?:string[], image?:string}} product
 * @param {number} [qty=1]
 */
export function addToCart(product, qty = 1) {
  if (!product || product.id == null) return read();
  const addQty = Math.max(1, parseInt(qty, 10) || 1);
  const items = read();
  const id = String(product.id);
  const existing = items.find((l) => l.id === id);
  if (existing) {
    existing.qty += addQty;
  } else {
    items.push({
      id,
      name: String(product.name ?? ""),
      price: Number(product.price) || 0,
      qty: addQty,
      image: product.image ?? product.images?.[0] ?? null,
    });
  }
  write(items);
  return items;
}

/** Remove a line entirely. */
export function removeFromCart(id) {
  const items = read().filter((l) => l.id !== String(id));
  write(items);
  return items;
}

/** Set the quantity of a line. qty <= 0 removes it. */
export function updateQty(id, qty) {
  const next = parseInt(qty, 10) || 0;
  if (next <= 0) return removeFromCart(id);
  const items = read();
  const line = items.find((l) => l.id === String(id));
  if (line) line.qty = next;
  write(items);
  return items;
}

/** Empty the cart. */
export function clearCart() {
  write([]);
  return [];
}

/** Total number of items (sum of quantities). */
export function getCartCount() {
  return count(read());
}

/** Total CAD price as a number rounded to 2 decimal places. */
export function getCartTotal() {
  const total = read().reduce((sum, l) => sum + l.price * l.qty, 0);
  return Number(total.toFixed(2));
}

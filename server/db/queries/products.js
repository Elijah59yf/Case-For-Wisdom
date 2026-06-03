import { v4 as uuid } from "uuid";
import { slugify } from "../../utils/slugify.js";

export function prepareProductInsert(input) {
  if (!input?.name) throw Object.assign(new Error("name is required"), { status: 400 });
  if (input.price == null) throw Object.assign(new Error("price is required"), { status: 400 });
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) throw Object.assign(new Error("price must be a non-negative number"), { status: 400 });
  return {
    id: input.id || uuid(),
    name: String(input.name).trim(),
    slug: (input.slug && String(input.slug).trim()) || slugify(input.name),
    description: input.description ?? null,
    price,
    images: Array.isArray(input.images) ? input.images : [],
    category: input.category ?? null,
    in_stock: input.in_stock == null ? true : !!input.in_stock,
    stock_count: Number.isFinite(+input.stock_count) ? +input.stock_count : 0,
    stripe_price_id: input.stripe_price_id ?? null,
  };
}

export function prepareProductUpdate(input) {
  const out = {};
  for (const k of ["name", "slug", "description", "category", "stripe_price_id"]) {
    if (k in input) out[k] = input[k];
  }
  if ("price" in input) out.price = Number(input.price);
  if ("images" in input) out.images = Array.isArray(input.images) ? input.images : [];
  if ("in_stock" in input) out.in_stock = !!input.in_stock;
  if ("stock_count" in input) out.stock_count = +input.stock_count;
  return out;
}

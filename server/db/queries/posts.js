import { v4 as uuid } from "uuid";
import { slugify } from "../../utils/slugify.js";

export function preparePostInsert(input) {
  if (!input?.title) throw Object.assign(new Error("title is required"), { status: 400 });
  return {
    id: input.id || uuid(),
    title: String(input.title).trim(),
    slug: (input.slug && String(input.slug).trim()) || slugify(input.title),
    excerpt: input.excerpt ?? null,
    body: input.body ?? null,
    cover_url: input.cover_url ?? null,
    category: input.category ?? null,
    published: !!input.published,
  };
}

export function preparePostUpdate(input) {
  const out = {};
  for (const k of ["title", "slug", "excerpt", "body", "cover_url", "category"]) {
    if (k in input) out[k] = input[k];
  }
  if ("published" in input) out.published = !!input.published;
  return out;
}

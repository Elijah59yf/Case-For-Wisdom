import { v4 as uuid } from "uuid";
import { slugify } from "../../utils/slugify.js";

export function prepareEventInsert(input) {
  if (!input?.title) throw Object.assign(new Error("title is required"), { status: 400 });
  if (!input?.event_date) throw Object.assign(new Error("event_date is required"), { status: 400 });
  return {
    id: input.id || uuid(),
    title: String(input.title).trim(),
    slug: (input.slug && String(input.slug).trim()) || slugify(input.title),
    description: input.description ?? null,
    event_date: input.event_date,
    end_date: input.end_date ?? null,
    location: input.location ?? null,
    location_url: input.location_url ?? null,
    is_online: !!input.is_online,
    is_inperson: !!input.is_inperson,
    is_paid: !!input.is_paid,
    price: input.price == null ? 0 : Number(input.price) || 0,
    capacity: input.capacity == null || input.capacity === "" ? null : Number(input.capacity),
    registration_open: input.registration_open == null ? true : !!input.registration_open,
    cover_url: input.cover_url ?? null,
    published: !!input.published,
  };
}

export function prepareEventUpdate(input) {
  const out = {};
  for (const k of ["title", "slug", "description", "event_date", "end_date", "location", "location_url", "cover_url"]) {
    if (k in input) out[k] = input[k];
  }
  for (const k of ["is_online", "is_inperson", "is_paid", "registration_open", "published"]) {
    if (k in input) out[k] = !!input[k];
  }
  if ("price" in input) out.price = input.price == null ? 0 : Number(input.price) || 0;
  if ("capacity" in input) out.capacity = input.capacity == null || input.capacity === "" ? null : Number(input.capacity);
  return out;
}

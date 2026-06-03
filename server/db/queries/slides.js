import { v4 as uuid } from "uuid";

export function prepareSlideInsert(input) {
  if (!input?.image_url) {
    throw Object.assign(new Error("image_url is required"), { status: 400 });
  }
  return {
    id: input.id || uuid(),
    image_url: String(input.image_url).trim(),
    caption: input.caption == null ? null : String(input.caption).trim(),
    alt_text: input.alt_text == null ? null : String(input.alt_text).trim(),
    position: Number.isFinite(+input.position) ? +input.position : 0,
    active: input.active == null ? true : !!input.active,
  };
}

export function prepareSlideUpdate(input) {
  const out = {};
  if ("image_url" in input) out.image_url = String(input.image_url).trim();
  if ("caption" in input) out.caption = input.caption == null ? null : String(input.caption);
  if ("alt_text" in input) out.alt_text = input.alt_text == null ? null : String(input.alt_text);
  if ("position" in input) out.position = +input.position;
  if ("active" in input) out.active = !!input.active;
  return out;
}

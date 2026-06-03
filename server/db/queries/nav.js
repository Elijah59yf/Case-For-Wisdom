import { v4 as uuid } from "uuid";

export function prepareNavInsert(input) {
  if (!input?.label) throw Object.assign(new Error("label is required"), { status: 400 });
  if (!input?.url) throw Object.assign(new Error("url is required"), { status: 400 });
  return {
    id: input.id || uuid(),
    label: String(input.label).trim(),
    url: String(input.url).trim(),
    position: Number.isFinite(+input.position) ? +input.position : 0,
    visible: input.visible == null ? true : !!input.visible,
    opens_new: !!input.opens_new,
  };
}

export function prepareNavUpdate(input) {
  const out = {};
  for (const k of ["label", "url"]) {
    if (k in input) out[k] = String(input[k]).trim();
  }
  if ("position" in input) out.position = +input.position;
  if ("visible" in input) out.visible = !!input.visible;
  if ("opens_new" in input) out.opens_new = !!input.opens_new;
  return out;
}

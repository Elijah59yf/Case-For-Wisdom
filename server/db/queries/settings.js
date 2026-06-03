const ALLOWED_KEYS = new Set([
  "site_name",
  "tagline",
  "hero_headline",
  "hero_subtext",
  "footer_copy",
  "instagram_url",
  "substack_url",
  "interstitial_image_url",
]);

export function validateSetting(key, value) {
  if (!ALLOWED_KEYS.has(key)) {
    throw Object.assign(new Error(`unknown setting key: ${key}`), { status: 400 });
  }
  if (value != null && typeof value !== "string") {
    throw Object.assign(new Error("setting value must be a string"), { status: 400 });
  }
  return { key, value: value ?? "" };
}

export function allowedKeys() {
  return [...ALLOWED_KEYS];
}

// Site chrome — nav, footer, and data-setting injection.
// Pulls live values from the backend so the admin panel can edit them.

import { getNavItems, getSettings } from "/assets/js/lib/api.js";
import { getCartCount } from "/assets/js/cart.js";

const FALLBACK_NAV = [
  { label: "Journal", url: "/", visible: true },
  { label: "About",   url: "/about", visible: true },
  { label: "Shop",    url: "/shop", visible: true },
  { label: "Events",  url: "/events.html", visible: true }
];

const FALLBACK_SETTINGS = {
  site_name:      "A Case for Wisdom",
  tagline:        "The Source. The Sustainer.",
  hero_headline:  "A quiet case for wisdom, written slowly.",
  hero_subtext:   "Essays, reflections, and considered objects rooted in the older streams — scripture, season, and the long patience of a life lived attentively.",
  footer_copy:    "Made slowly in Canada.",
  instagram_url:  "",
  substack_url:   "",
  interstitial_image_url: ""
};

let _settingsPromise;
function settings() {
  if (!_settingsPromise) {
    _settingsPromise = getSettings()
      .then((s) => (s && typeof s === "object" && Object.keys(s).length > 0 ? { ...FALLBACK_SETTINGS, ...s } : { ...FALLBACK_SETTINGS }))
      .catch(() => ({ ...FALLBACK_SETTINGS }));
  }
  return _settingsPromise;
}

// ── Cart bubble ──────────────────────────────────────────────────────────
// Reflects the cart count (cart.js) into every [data-cart-count] node in the
// nav. Re-runs whenever the cart changes (cart.js dispatches `cart:change`).
export function updateCartBubble() {
  const count = getCartCount();
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = String(count);
    el.hidden = count === 0;
  });
}

// Bind once per page load so the bubble stays live across add/remove/clear,
// including changes made in another tab (the `storage` event).
let _cartBound = false;
function bindCartBubble() {
  if (_cartBound) return;
  _cartBound = true;
  window.addEventListener("cart:change", updateCartBubble);
  window.addEventListener("storage", (e) => {
    if (!e.key || e.key === "acfw_cart") updateCartBubble();
  });
}

function isActive(href) {
  if (!href) return false;
  const here = window.location.pathname.replace(/\/$/, "");
  const there = href.replace(/\/$/, "");
  return here === there || (there && here.startsWith(there + "/"));
}

export async function loadNav() {
  let items;
  try {
    const fetched = await getNavItems();
    items = Array.isArray(fetched) && fetched.length > 0 ? fetched : FALLBACK_NAV;
  } catch {
    items = FALLBACK_NAV;
  }
  const s = await settings();

  const siteName = s.site_name || FALLBACK_SETTINGS.site_name;
  document.querySelectorAll("[data-site-name], .nav__site-name, .nav__brand-text").forEach((el) => {
    el.textContent = siteName;
  });
  document.querySelectorAll("[data-setting='site_name']").forEach((el) => { el.textContent = siteName; });

  const containers = document.querySelectorAll(".nav__links, [data-nav-links]");
  const drawers = document.querySelectorAll(".nav__drawer");

  for (const container of containers) {
    container.innerHTML = "";
    for (const item of items) {
      const a = document.createElement("a");
      a.className = "nav__link";
      a.href = item.url;
      a.textContent = item.label;
      if (item.opens_new) { a.target = "_blank"; a.rel = "noopener"; }
      if (isActive(item.url)) a.setAttribute("aria-current", "page");
      container.appendChild(a);
    }
  }

  // Keep the cart bubble in sync with cart.js on every page that loads the nav.
  bindCartBubble();
  updateCartBubble();

  for (const drawer of drawers) {
    // Preserve any non-link drawer chrome (e.g. cart link) by clearing only nav links.
    drawer.querySelectorAll(".nav__link[data-nav-dynamic]").forEach((n) => n.remove());
    for (const item of items) {
      const a = document.createElement("a");
      a.className = "nav__link";
      a.dataset.navDynamic = "true";
      a.href = item.url;
      a.textContent = item.label;
      if (item.opens_new) { a.target = "_blank"; a.rel = "noopener"; }
      drawer.appendChild(a);
    }
  }
}

export async function loadSettings() {
  const s = await settings();
  document.querySelectorAll("[data-setting]").forEach((el) => {
    const key = el.dataset.setting;
    if (s[key] != null && s[key] !== "") {
      // Tagline contains a deliberate line break — preserve it.
      if (key === "tagline") el.innerHTML = String(s[key]).replace(/\s*\.\s*/g, ".<br/>").replace(/<br\/>$/, "");
      else el.textContent = s[key];
    }
  });

  const interstitial = document.getElementById("interstitial");
  if (interstitial) {
    const url = s.interstitial_image_url;
    if (url) {
      const img = document.createElement("img");
      img.className = "interstitial__img";
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.setAttribute("aria-hidden", "true");
      interstitial.replaceChildren(img);
      interstitial.hidden = false;
    } else {
      interstitial.hidden = true;
    }
  }
  return s;
}

export async function loadFooter() {
  const s = await settings();
  const year = new Date().getFullYear();
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = year; });

  document.querySelectorAll("[data-footer-copy]").forEach((el) => {
    el.textContent = s.footer_copy || "";
  });
  document.querySelectorAll("[data-footer-tagline]").forEach((el) => {
    el.textContent = s.tagline || "";
  });

  const insta = document.querySelector("[data-social='instagram']");
  if (insta) {
    if (s.instagram_url) { insta.href = s.instagram_url; insta.hidden = false; }
    else { insta.hidden = true; }
  }
  const sub = document.querySelector("[data-social='substack']");
  if (sub) {
    if (s.substack_url) { sub.href = s.substack_url; sub.hidden = false; }
    else { sub.hidden = true; }
  }
}

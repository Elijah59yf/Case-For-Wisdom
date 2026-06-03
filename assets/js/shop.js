/* ============================================================
   shop.js — public-facing shop rendering
   Single responsibility: read products, render cards.
   Supabase wiring is stubbed; swap the placeholder once
   lib/supabase.js exposes the client.
   ============================================================ */

const PRICE_FMT = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const RADIUS_VARIANTS = ["card--radius-b", "card--radius-a", "card--radius-b"];
const OFFSET_VARIANTS = ["", "offset-up", "offset-down"];

/**
 * Fetch a small selection of in-stock products for the homepage strip.
 * Stubbed until Supabase is wired in.
 */
export async function fetchFeaturedProducts(limit = 3) {
  // TODO: replace with:
  //   const { data, error } = await supabase
  //     .from("products")
  //     .select("id, slug, name, description, price, images, category")
  //     .eq("in_stock", true)
  //     .order("created_at", { ascending: false })
  //     .limit(limit);
  //   if (error) throw error;
  //   return data;
  return [
    {
      id: "stub-p-1",
      slug: "wisdom-print-no-1",
      name: "Wisdom Print No. 01 — Proverbs 4",
      category: "Print",
      price: 38.0,
      images: [],
    },
    {
      id: "stub-p-2",
      slug: "field-notes-vol-i",
      name: "Field Notes, Volume I",
      category: "Paper",
      price: 24.0,
      images: [],
    },
    {
      id: "stub-p-3",
      slug: "tree-of-life-pendant",
      name: "Tree of Life pendant",
      category: "Object",
      price: 96.0,
      images: [],
    },
  ].slice(0, limit);
}

function productCard(product, index) {
  const radius = RADIUS_VARIANTS[index % RADIUS_VARIANTS.length];
  const offset = OFFSET_VARIANTS[index % OFFSET_VARIANTS.length];
  const cover = product.images?.[0];

  const article = document.createElement("article");
  article.className = `card card--tint ${radius} ${offset} product-card reveal`.trim();

  const media = cover
    ? `<img src="${cover}" alt="" loading="lazy" />`
    : `<div class="placeholder-media" aria-hidden="true"></div>`;

  article.innerHTML = `
    <a href="/shop/product.html?id=${encodeURIComponent(product.id)}" aria-label="${product.name}">
      <div class="card__media">${media}</div>
      <p class="card__eyebrow">${product.category ?? "Object"}</p>
      <h3 class="card__title">${product.name}</h3>
      <p class="product-card__price">${PRICE_FMT.format(product.price)}</p>
    </a>
  `;
  return article;
}

/**
 * Render the featured products strip on the homepage.
 */
function emptyShopCard() {
  const article = document.createElement("article");
  article.className = "shop-card reveal is-visible";
  article.innerHTML = `
    <p class="shop-card__category">Shop</p>
    <div class="shop-card__media"><div class="placeholder-media" aria-hidden="true"></div></div>
    <h3 class="shop-card__title"><em>Objects coming soon.</em></h3>
    <p class="shop-card__price">A small shelf is being prepared.</p>
  `;
  return article;
}

function featuredSkeletons(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "skeleton-card";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="skeleton skeleton-line skeleton-line--sm"></div>
      <div class="skeleton skeleton-card__media"></div>
      <div class="skeleton skeleton-line skeleton-line--title"></div>
      <div class="skeleton skeleton-line skeleton-line--mid"></div>
    `;
    frag.appendChild(el);
  }
  return frag;
}

export async function renderFeaturedProducts(container) {
  if (!container) return;
  container.replaceChildren(featuredSkeletons(3));
  try {
    const products = await fetchFeaturedProducts(3);
    if (!products || !products.length) {
      container.replaceChildren(emptyShopCard());
      return;
    }
    container.replaceChildren(...products.map(productCard));
    container.querySelectorAll(".reveal").forEach((el) => {
      el.classList.add("is-visible");
    });
  } catch (err) {
    container.innerHTML = `
      <p class="alert alert--error">
        The shelf is being tidied — please try again shortly.
      </p>
    `;
    console.error("[shop] failed to render featured products", err);
  }
}

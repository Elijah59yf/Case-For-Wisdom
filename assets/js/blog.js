/* ============================================================
   blog.js — public-facing blog rendering
   Reads posts via api.js. Renders featured strips on the home
   page and the full journal index at /.
   ============================================================ */

import { getPosts } from "/assets/js/lib/api.js";

/* A controller whose signal aborts when the user leaves the page, so in-flight
   fetches are cancelled instead of resolving against a torn-down DOM. */
function navigationController() {
  const controller = new AbortController();
  window.addEventListener("pagehide", () => controller.abort(), { once: true });
  return controller;
}

function isAbort(err) {
  return err?.name === "AbortError";
}

/* Skeleton placeholders shown while posts are loading. */
function skeletonCards(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const card = document.createElement("article");
    card.className = "post-card skeleton-card";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `
      <div class="skeleton skeleton-card__media"></div>
      <div class="post-card__body">
        <div class="skeleton skeleton-line skeleton-line--sm"></div>
        <div class="skeleton skeleton-line skeleton-line--title"></div>
        <div class="skeleton skeleton-line skeleton-line--wide"></div>
        <div class="skeleton skeleton-line skeleton-line--mid"></div>
      </div>
    `;
    frag.appendChild(card);
  }
  return frag;
}

/* A real error state — distinct from "empty". Never a broken UI. */
function errorState() {
  const wrap = document.createElement("div");
  wrap.className = "posts-empty";
  wrap.setAttribute("role", "alert");
  wrap.innerHTML = `
    <p class="posts-empty__headline">The journal is resting just now.</p>
    <p class="posts-empty__sub">We couldn't reach the archive — please try again in a moment.</p>
  `;
  return wrap;
}

const DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "long", day: "numeric",
});

const PAGE_SIZE = 9;

const TREE_WATERMARK_SVG = `
  <svg class="post-card__watermark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" stroke-width="1.25" opacity="0.8"/>
    <path d="M32 14 V50" stroke="currentColor" stroke-width="1.25" fill="none"/>
    <path d="M32 22 Q24 24 22 32" stroke="currentColor" stroke-width="1" fill="none"/>
    <path d="M32 22 Q40 24 42 32" stroke="currentColor" stroke-width="1" fill="none"/>
    <path d="M32 30 Q26 32 24 40" stroke="currentColor" stroke-width="1" fill="none"/>
    <path d="M32 30 Q38 32 40 40" stroke="currentColor" stroke-width="1" fill="none"/>
    <path d="M14 50 Q22 46 32 50 T 50 50" stroke="currentColor" stroke-width="1.25" fill="none"/>
  </svg>
`;

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const RADIUS_VARIANTS = ["card--radius-a", "card--radius-b"];
const OFFSET_VARIANTS = ["", "offset-down", "offset-up"];

/**
 * Fetch the most recent published posts. Stubbed until Supabase is wired.
 * Returns an array of { id, slug, title, excerpt, cover_url, eyebrow, created_at }.
 */
export async function fetchFeaturedPosts(limit = 3) {
  // TODO: replace with:
  //   const { data, error } = await supabase
  //     .from("posts")
  //     .select("id, slug, title, excerpt, cover_url, created_at")
  //     .eq("published", true)
  //     .order("created_at", { ascending: false })
  //     .limit(limit);
  //   if (error) throw error;
  //   return data;
  return [
    {
      id: "stub-1",
      slug: "on-the-source",
      title: "On the source — and why the river still runs",
      excerpt:
        "Wisdom is not a position to be taken but a stream to be returned to. A first letter on where this journal begins.",
      cover_url: "",
      eyebrow: "Essay",
      created_at: "2026-04-12T09:00:00Z",
    },
    {
      id: "stub-2",
      slug: "slow-attention",
      title: "Slow attention as a spiritual discipline",
      excerpt:
        "Notes from a season of putting the phone down — and what the older traditions have to say about looking long enough to see.",
      cover_url: "",
      eyebrow: "Reflection",
      created_at: "2026-03-28T09:00:00Z",
    },
    {
      id: "stub-3",
      slug: "letter-from-the-mountain",
      title: "A letter from the mountain, in April",
      excerpt:
        "Three weeks in a small cabin, a worn psalter, and the slow work of unlearning what hurry teaches.",
      cover_url: "",
      eyebrow: "Letter",
      created_at: "2026-03-04T09:00:00Z",
    },
  ].slice(0, limit);
}

function postCard(post, index) {
  const radius = RADIUS_VARIANTS[index % RADIUS_VARIANTS.length];
  const offset = OFFSET_VARIANTS[index % OFFSET_VARIANTS.length];
  const eyebrow = post.eyebrow ?? "Essay";
  const date = post.created_at ? DATE_FMT.format(new Date(post.created_at)) : "";

  const article = document.createElement("article");
  article.className = `card ${radius} ${offset} reveal`.trim();

  const media = post.cover_url
    ? `<img src="${post.cover_url}" alt="" loading="lazy" />`
    : `<div class="placeholder-media" aria-hidden="true"></div>`;

  article.innerHTML = `
    <a href="/post.html?slug=${encodeURIComponent(post.slug)}" aria-label="${post.title}">
      <div class="card__media">${media}</div>
      <p class="card__eyebrow">${eyebrow}</p>
      <h3 class="card__title">${post.title}</h3>
      <p class="card__excerpt">${post.excerpt ?? ""}</p>
      <div class="card__meta">
        <span>${date}</span>
        <span class="card__meta-sep" aria-hidden="true"></span>
        <span>Read essay</span>
      </div>
    </a>
  `;
  return article;
}

/**
 * Render up to 3 featured posts into the given container.
 * Replaces any placeholder content already inside.
 */
function emptyJournalCard() {
  const article = document.createElement("article");
  article.className = "journal-card reveal is-visible";
  article.innerHTML = `
    <p class="journal-card__category">Journal</p>
    <h3 class="journal-card__title"><em>Essays coming soon.</em></h3>
    <p class="journal-card__excerpt">The first letters are being written slowly. Return in a season.</p>
  `;
  return article;
}

/* ============================================================
   Journal index — /
   ============================================================ */

function journalCard(post, index, { lead = false } = {}) {
  const radius = index % 2 === 0 ? "post-card--radius-a" : "post-card--radius-b";
  const category = post.category || "Essay";
  const date = post.created_at ? DATE_FMT.format(new Date(post.created_at)) : "";
  const readTime = Number.isFinite(post.read_time) ? `${post.read_time} min read` : "";

  const article = document.createElement("article");
  article.className = `post-card ${radius} ${lead ? "post-card--lead" : ""} reveal`.trim();

  const mediaInner = post.cover_url
    ? `<img class="post-card__img" src="${escapeHTML(post.cover_url)}" alt="" loading="lazy" decoding="async" />`
    : TREE_WATERMARK_SVG;
  const mediaEmpty = post.cover_url ? "" : ' data-empty="true"';

  article.innerHTML = `
    <a class="post-card__link" href="/post.html?slug=${encodeURIComponent(post.slug)}" aria-label="${escapeHTML(post.title)}">
      <div class="post-card__image-wrap"${mediaEmpty}>${mediaInner}</div>
      <div class="post-card__body">
        <p class="post-card__category">${escapeHTML(category)}</p>
        <h2 class="post-card__title">${escapeHTML(post.title)}</h2>
        ${post.excerpt ? `<p class="post-card__excerpt">${escapeHTML(post.excerpt)}</p>` : ""}
        <div class="post-card__meta">
          ${date ? `<span>${escapeHTML(date)}</span>` : ""}
          ${date && readTime ? `<span class="post-card__meta-dot" aria-hidden="true"></span>` : ""}
          ${readTime ? `<span>${escapeHTML(readTime)}</span>` : ""}
        </div>
      </div>
    </a>
  `;
  return article;
}

function emptyState() {
  const wrap = document.createElement("div");
  wrap.className = "posts-empty reveal";
  wrap.innerHTML = `
    <p class="posts-empty__headline">The first essay is being written.</p>
    <p class="posts-empty__sub">Check back soon.</p>
  `;
  return wrap;
}

function readUrlParams() {
  const u = new URL(window.location.href);
  const page = Math.max(1, parseInt(u.searchParams.get("page") || "1", 10) || 1);
  const category = u.searchParams.get("category") || "all";
  return { page, category };
}

function writeUrlParams({ page, category }) {
  const u = new URL(window.location.href);
  if (page > 1) u.searchParams.set("page", String(page));
  else u.searchParams.delete("page");
  if (category && category !== "all") u.searchParams.set("category", category);
  else u.searchParams.delete("category");
  window.history.replaceState({}, "", u.toString());
}

function renderGrid(grid, posts) {
  grid.replaceChildren();
  if (!posts.length) {
    grid.appendChild(emptyState());
    if (window.__revealObserve) window.__revealObserve(grid);
    return;
  }
  posts.forEach((p, i) => {
    grid.appendChild(journalCard(p, i, { lead: i === 0 }));
  });
  if (window.__revealObserve) window.__revealObserve(grid);
}

function renderPagination(nav, { currentLabel, prevLink, nextLink }, { page, totalPages, category }) {
  if (totalPages <= 1) { nav.hidden = true; return; }
  nav.hidden = false;
  currentLabel.textContent = `Page ${page} of ${totalPages}`;

  const baseUrl = (p) => {
    const u = new URL(window.location.href);
    if (p > 1) u.searchParams.set("page", String(p));
    else u.searchParams.delete("page");
    if (category && category !== "all") u.searchParams.set("category", category);
    else u.searchParams.delete("category");
    return u.pathname + u.search;
  };

  if (page < totalPages) {
    prevLink.href = baseUrl(page + 1);
    prevLink.classList.remove("is-disabled");
    prevLink.removeAttribute("aria-disabled");
  } else {
    prevLink.href = "#";
    prevLink.classList.add("is-disabled");
    prevLink.setAttribute("aria-disabled", "true");
  }

  if (page > 1) {
    nextLink.href = baseUrl(page - 1);
    nextLink.classList.remove("is-disabled");
    nextLink.removeAttribute("aria-disabled");
  } else {
    nextLink.href = "#";
    nextLink.classList.add("is-disabled");
    nextLink.setAttribute("aria-disabled", "true");
  }
}

export async function renderJournalIndex(refs) {
  const { grid, pagination, currentLabel, prevLink, nextLink, filterTabs, descriptionEl, searchInput, searchCount } = refs;
  if (!grid) return;

  const { page, category } = readUrlParams();

  // Show skeletons immediately so there's no blank flash while we fetch.
  grid.replaceChildren(skeletonCards(6));
  if (pagination) pagination.hidden = true;

  const controller = navigationController();

  let result;
  try {
    result = await getPosts({ page, limit: PAGE_SIZE }, { signal: controller.signal });
  } catch (err) {
    if (isAbort(err)) return; // user navigated away — drop silently
    console.error("[journal] failed to fetch posts", err);
    grid.replaceChildren(errorState());
    if (pagination) pagination.hidden = true;
    return;
  }

  // Normalize: the route returns { data, total, page, limit }.
  const allPosts = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
  const total = Number.isFinite(result?.total) ? result.total : allPosts.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Initial active category from URL
  filterTabs.forEach((tab) => {
    const isActive = tab.dataset.category === category;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  // Active filter state. Category comes from the tabs/URL; query from the
  // search box. Both narrow the already-fetched page — no extra API call.
  let activeCategory = category;
  let activeQuery = "";

  function updateSearchCount(matchCount) {
    if (!searchCount) return;
    if (!activeQuery) {
      searchCount.hidden = true;
      searchCount.textContent = "";
      return;
    }
    searchCount.hidden = false;
    const noun = matchCount === 1 ? "result" : "results";
    searchCount.textContent = `${matchCount} ${noun} for “${activeQuery}”`;
  }

  function applyFilters() {
    const byCategory = activeCategory === "all"
      ? allPosts
      : allPosts.filter((p) => (p.category || "").toLowerCase() === activeCategory.toLowerCase());

    const q = activeQuery.toLowerCase();
    const filtered = q
      ? byCategory.filter((p) =>
          (p.title || "").toLowerCase().includes(q) ||
          (p.excerpt || "").toLowerCase().includes(q))
      : byCategory;

    renderGrid(grid, filtered);
    updateSearchCount(filtered.length);

    // Pagination reflects the server-side page set; a live search filters
    // within the current page, so hide it while a query is active.
    if (activeQuery) {
      if (pagination) pagination.hidden = true;
    } else {
      renderPagination(pagination, { currentLabel, prevLink, nextLink }, {
        page, totalPages, category: activeCategory,
      });
    }
  }

  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const cat = tab.dataset.category || "all";
      activeCategory = cat;
      filterTabs.forEach((t) => {
        const a = t === tab;
        t.classList.toggle("is-active", a);
        t.setAttribute("aria-selected", String(a));
      });
      writeUrlParams({ page, category: cat });
      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      activeQuery = searchInput.value.trim();
      applyFilters();
    });
  }

  applyFilters();
}

function featuredSkeletons(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "skeleton-card";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="skeleton skeleton-card__media"></div>
      <div class="skeleton skeleton-line skeleton-line--sm"></div>
      <div class="skeleton skeleton-line skeleton-line--title"></div>
      <div class="skeleton skeleton-line skeleton-line--wide"></div>
    `;
    frag.appendChild(el);
  }
  return frag;
}

export async function renderFeaturedPosts(container) {
  if (!container) return;
  container.replaceChildren(featuredSkeletons(3));
  try {
    const posts = await fetchFeaturedPosts(3);
    if (!posts || !posts.length) {
      container.replaceChildren(emptyJournalCard());
      return;
    }
    container.replaceChildren(...posts.map(postCard));

    // Re-attach scroll-reveal observation to newly inserted cards
    container.querySelectorAll(".reveal").forEach((el) => {
      el.classList.add("is-visible");
    });
  } catch (err) {
    container.innerHTML = `
      <p class="alert alert--error">
        The journal is resting just now — please try again in a moment.
      </p>
    `;
    console.error("[blog] failed to render featured posts", err);
  }
}

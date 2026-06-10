/* ============================================================
   blog.js — public-facing journal rendering
   Reads posts via api.js and renders the journal index at / as a
   plain article list (no cards, no images by default).
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

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "long", day: "numeric",
});

const PAGE_SIZE = 9;

/* Skeleton placeholders shown while posts are loading — shaped like the
   article items they replace so the layout doesn't jump. */
function skeletonItems(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const li = document.createElement("li");
    li.className = "article-item";
    li.setAttribute("aria-hidden", "true");
    li.innerHTML = `
      <div class="article-content">
        <div class="skeleton skeleton-line skeleton-line--sm"></div>
        <div class="skeleton skeleton-line skeleton-line--title" style="margin: var(--space-2) 0;"></div>
        <div class="skeleton skeleton-line skeleton-line--wide"></div>
      </div>
    `;
    frag.appendChild(li);
  }
  return frag;
}

/* A real error state — distinct from "empty". Never a broken UI. */
function errorState() {
  const li = document.createElement("li");
  li.className = "posts-empty";
  li.setAttribute("role", "alert");
  li.innerHTML = `
    <p class="posts-empty__headline">The journal is resting just now.</p>
    <p class="posts-empty__sub">We couldn't reach the archive — please try again in a moment.</p>
  `;
  return li;
}

function emptyState() {
  const li = document.createElement("li");
  li.className = "posts-empty";
  li.innerHTML = `
    <p class="posts-empty__headline">The first essay is being written.</p>
    <p class="posts-empty__sub">Check back soon.</p>
  `;
  return li;
}

/* ============================================================
   Article item — date · category · read time, title, excerpt
   Optional thumbnail only when the post has a cover_url.
   ============================================================ */
function articleItem(post, { lead = false } = {}) {
  const category = post.category || "Essay";
  const date = post.created_at ? DATE_FMT.format(new Date(post.created_at)) : "";
  const readTime = Number.isFinite(post.read_time) ? `${post.read_time} min read` : "";
  const meta = [date, category, readTime].filter(Boolean).join(" · ");

  const li = document.createElement("li");
  li.className = `article-item${lead ? " article-item--lead" : ""}`;

  const thumb = post.cover_url
    ? `<img class="article-thumb" src="${escapeHTML(post.cover_url)}" alt="" loading="lazy" decoding="async" />`
    : "";

  li.innerHTML = `
    <div class="article-content">
      <div class="article-meta">${escapeHTML(meta)}</div>
      <a class="article-title" href="/post.html?slug=${encodeURIComponent(post.slug)}">${escapeHTML(post.title)}</a>
      ${post.excerpt ? `<p class="article-excerpt">${escapeHTML(post.excerpt)}</p>` : ""}
    </div>
    ${thumb}
  `;
  return li;
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

function renderList(list, posts) {
  list.replaceChildren();
  if (!posts.length) {
    list.appendChild(emptyState());
    return;
  }
  posts.forEach((p, i) => list.appendChild(articleItem(p, { lead: i === 0 })));
}

function renderPagination(nav, { currentLabel, prevLink, nextLink }, { page, totalPages, category }) {
  if (!nav) return;
  if (totalPages <= 1) { nav.hidden = true; return; }
  nav.hidden = false;
  if (currentLabel) currentLabel.textContent = `Page ${page} of ${totalPages}`;

  const baseUrl = (p) => {
    const u = new URL(window.location.href);
    if (p > 1) u.searchParams.set("page", String(p));
    else u.searchParams.delete("page");
    if (category && category !== "all") u.searchParams.set("category", category);
    else u.searchParams.delete("category");
    return u.pathname + u.search;
  };

  if (prevLink) {
    if (page < totalPages) {
      prevLink.href = baseUrl(page + 1);
      prevLink.classList.remove("is-disabled");
      prevLink.removeAttribute("aria-disabled");
    } else {
      prevLink.href = "#";
      prevLink.classList.add("is-disabled");
      prevLink.setAttribute("aria-disabled", "true");
    }
  }

  if (nextLink) {
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
}

export async function renderJournalIndex(refs) {
  const { grid, pagination, currentLabel, prevLink, nextLink, filterTabs, searchInput, searchCount } = refs;
  if (!grid) return;

  const { page, category } = readUrlParams();

  // Show skeletons immediately so there's no blank flash while we fetch.
  grid.replaceChildren(skeletonItems(6));
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

    renderList(grid, filtered);
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

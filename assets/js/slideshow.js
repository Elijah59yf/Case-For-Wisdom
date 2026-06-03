/* ============================================================
   slideshow.js — Hero crossfade slideshow.
   Editorial pacing, no arrows, dots indicator only.
   ============================================================ */

const AUTO_MS = 5000;
const SWIPE_THRESHOLD = 50;

export class HeroSlideshow {
  constructor(target, slides) {
    this.root = typeof target === "string" ? document.querySelector(target) : target;
    if (!this.root) throw new Error("HeroSlideshow: container not found");
    this.slides = Array.isArray(slides) ? slides.filter((s) => s && s.image_url) : [];
    this.index = 0;
    this.timer = null;
    this.paused = false;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.touchStartX = null;
    this._onMouseEnter = () => this.pause();
    this._onMouseLeave = () => this.resume();
    this._onTouchStart = (e) => { this.touchStartX = e.touches[0]?.clientX ?? null; };
    this._onTouchEnd = (e) => this._handleTouchEnd(e);
    this._onVisibility = () => (document.hidden ? this.pause() : this.resume());

    this._init();
  }

  _init() {
    this.root.classList.add("slideshow", "is-loading");

    if (!this.slides.length) {
      this.root.classList.remove("is-loading");
      this.root.classList.add("is-empty");
      return;
    }

    this._preload().then(() => {
      this._render();
      this.root.classList.remove("is-loading");
      this._bind();
      if (!this.reduced && this.slides.length > 1) this._scheduleNext();
    });
  }

  _preload() {
    return Promise.all(
      this.slides.map((s) => new Promise((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = s.image_url;
      }))
    );
  }

  _render() {
    const overlay = document.createElement("div");
    overlay.className = "slideshow__overlay";

    const track = document.createElement("div");
    track.className = "slideshow__track";

    this.slideEls = this.slides.map((s, i) => {
      const fig = document.createElement("figure");
      fig.className = "slideshow__slide" + (i === 0 ? " is-active" : "");
      const img = document.createElement("img");
      img.className = "slideshow__img";
      img.src = s.image_url;
      img.alt = s.alt_text || "";
      img.loading = i === 0 ? "eager" : "lazy";
      img.decoding = "async";
      fig.appendChild(img);
      if (s.caption) {
        const cap = document.createElement("figcaption");
        cap.className = "slideshow__caption";
        cap.textContent = s.caption;
        fig.appendChild(cap);
      }
      track.appendChild(fig);
      return fig;
    });

    this.root.appendChild(track);
    this.root.appendChild(overlay);

    if (this.slides.length > 1) {
      const dots = document.createElement("div");
      dots.className = "slideshow__dots";
      dots.setAttribute("role", "tablist");
      this.dotEls = this.slides.map((_, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "slideshow__dot" + (i === 0 ? " is-active" : "");
        b.setAttribute("aria-label", `Show slide ${i + 1}`);
        b.addEventListener("click", () => this.goTo(i));
        dots.appendChild(b);
        return b;
      });
      this.root.appendChild(dots);
    }
  }

  _bind() {
    this.root.addEventListener("mouseenter", this._onMouseEnter);
    this.root.addEventListener("mouseleave", this._onMouseLeave);
    this.root.addEventListener("touchstart", this._onTouchStart, { passive: true });
    this.root.addEventListener("touchend", this._onTouchEnd, { passive: true });
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  _handleTouchEnd(e) {
    if (this.touchStartX == null) return;
    const endX = e.changedTouches[0]?.clientX ?? this.touchStartX;
    const dx = endX - this.touchStartX;
    this.touchStartX = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    const next = dx < 0 ? this.index + 1 : this.index - 1;
    this.goTo((next + this.slides.length) % this.slides.length);
  }

  _scheduleNext() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.paused) this.goTo((this.index + 1) % this.slides.length);
    }, AUTO_MS);
  }

  goTo(i) {
    if (!this.slideEls || i === this.index) return;
    this.slideEls[this.index]?.classList.remove("is-active");
    this.dotEls?.[this.index]?.classList.remove("is-active");
    this.index = i;
    this.slideEls[this.index]?.classList.add("is-active");
    this.dotEls?.[this.index]?.classList.add("is-active");
    if (!this.reduced && this.slides.length > 1) this._scheduleNext();
  }

  pause() {
    this.paused = true;
    clearTimeout(this.timer);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (!this.reduced && this.slides.length > 1) this._scheduleNext();
  }

  destroy() {
    clearTimeout(this.timer);
    this.root.removeEventListener("mouseenter", this._onMouseEnter);
    this.root.removeEventListener("mouseleave", this._onMouseLeave);
    this.root.removeEventListener("touchstart", this._onTouchStart);
    this.root.removeEventListener("touchend", this._onTouchEnd);
    document.removeEventListener("visibilitychange", this._onVisibility);
    this.root.innerHTML = "";
    this.root.classList.remove("slideshow", "is-loading", "is-empty");
  }
}

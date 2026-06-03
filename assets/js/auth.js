// auth.js — the single auth surface every admin page imports.
//
// Admin pages call ONLY signIn / signOut / getSession / isAuthenticated from
// here. They never touch localStorage or supabase.auth directly (CLAUDE.md §8.2).
// The transport lives in lib/api.js; this module resolves the right path per
// deployment target and presents a target-agnostic surface.
//
//   Target B (VPS)        — JWT. A short-lived (8h) access token is held by
//                           api.js (in memory, mirrored to sessionStorage). A
//                           long-lived (30d) refresh token lives in an httpOnly
//                           cookie and is rotated via POST /api/auth/refresh.
//                           A timer refreshes the access token 5 minutes before
//                           it expires; isAuthenticated() also refreshes on
//                           demand using the cookie.
//   Target A (Cloudflare) — Supabase Auth. signIn → signInWithPassword (via
//                           api.js); the SDK stores and refreshes the session.

import {
  IS_VPS,
  login as apiLogin,
  logout as apiLogout,
  getToken,
  refreshSession,
} from "/assets/js/lib/api.js";

// Supabase client is loaded lazily and ONLY on the Cloudflare target, so the
// VPS target never fetches supabase-js. Mirrors the lazy import in api.js.
let _sbPromise;
function sb() {
  if (!_sbPromise) _sbPromise = import("/assets/js/lib/supabase.js").then((m) => m.default);
  return _sbPromise;
}

// Decode a JWT payload without verifying the signature (verification is the
// server's job via authGuard). Used only to read `exp`/`sub`/`email` so the UI
// can tell whether the stored token is still live.
function decodeJwt(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ── Proactive refresh timer (VPS only) ────────────────────────────────────
const REFRESH_LEAD_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry
let _refreshTimer = null;

/**
 * Schedule a refresh of the access token 5 minutes before it expires. Called
 * after every successful login and after every successful refresh. No-op on
 * the Cloudflare target (the Supabase SDK refreshes itself).
 */
export function setupTokenRefresh() {
  if (!IS_VPS) return;
  clearTimeout(_refreshTimer);
  const token = getToken();
  if (!token) return;
  const claims = decodeJwt(token);
  if (!claims?.exp) return;
  const msUntilExpiry = claims.exp * 1000 - Date.now();
  const delay = Math.max(0, msUntilExpiry - REFRESH_LEAD_MS);
  _refreshTimer = setTimeout(() => {
    refreshAccessToken().catch(() => {
      /* a failed proactive refresh surfaces on the next protected call */
    });
  }, delay);
}

/**
 * Refresh the access token.
 *  - VPS: POST /api/auth/refresh (the httpOnly cookie is sent automatically),
 *    store the new access token, and re-arm the refresh timer. Returns the new
 *    token, or throws if the refresh failed.
 *  - Cloudflare: ask the Supabase SDK to refresh; returns the new access token.
 */
export async function refreshAccessToken() {
  if (IS_VPS) {
    const token = await refreshSession();
    if (token) setupTokenRefresh();
    return token;
  }
  const { data } = await (await sb()).auth.refreshSession();
  return data?.session?.access_token ?? null;
}

/**
 * Sign in on whichever target is active.
 *  - VPS: POST /api/auth/login → access token stored by api.js, refresh token
 *    set as an httpOnly cookie. Arms the refresh timer.
 *  - Cloudflare: supabase.auth.signInWithPassword(); session kept by the SDK.
 * Throws on invalid credentials.
 */
export async function signIn(email, password) {
  const out = await apiLogin(email, password);
  if (IS_VPS) setupTokenRefresh();
  return out;
}

/**
 * Sign out on whichever target is active.
 *  - VPS: revokes the refresh token server-side and clears the access token.
 *  - Cloudflare: supabase.auth.signOut().
 */
export async function signOut() {
  clearTimeout(_refreshTimer);
  await apiLogout();
}

/**
 * Return the current session, or null if there is none / it has expired.
 *  - VPS: { token, user: { id, email }, expires_at } decoded from the JWT.
 *  - Cloudflare: the Supabase session object (or null).
 */
export async function getSession() {
  if (IS_VPS) {
    const token = getToken();
    if (!token) return null;
    const claims = decodeJwt(token);
    if (!claims) return null;
    if (claims.exp && Date.now() >= claims.exp * 1000) return null;
    return {
      token,
      user: { id: claims.sub, email: claims.email },
      expires_at: claims.exp ?? null,
    };
  }
  const { data } = await (await sb()).auth.getSession();
  return data?.session ?? null;
}

/**
 * True when a live session exists. Admin pages gate on this.
 *  - VPS: a non-expired access token is live; otherwise try one refresh via the
 *    httpOnly cookie (handles a fresh page load / expired token). Returns false
 *    if the refresh fails.
 *  - Cloudflare: defer to the Supabase session.
 */
export async function isAuthenticated() {
  if (IS_VPS) {
    const token = getToken();
    if (token) {
      const claims = decodeJwt(token);
      if (claims?.exp && Date.now() < claims.exp * 1000) {
        setupTokenRefresh();
        return true;
      }
    }
    // No token, or it has expired → attempt a refresh from the cookie.
    try {
      return (await refreshAccessToken()) != null;
    } catch {
      return false;
    }
  }
  return (await getSession()) != null;
}

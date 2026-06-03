import { Router } from "express";
import {
  login,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
  hashPassword,
} from "../services/auth.service.js";
import { authGuard } from "../middleware/authGuard.js";
import { sanitizeBody } from "../middleware/sanitize.js";
import { db } from "../db/index.js";

const router = Router();

const REFRESH_COOKIE = "refreshToken";
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// httpOnly cookie options. Secure in production; SameSite=Strict keeps the
// refresh token off cross-site requests. Scoped to /api/auth so it is only
// ever sent to the refresh/logout endpoints.
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: REFRESH_MAX_AGE,
  };
}

// Issue a refresh token, persist only its hash, and set it as an httpOnly cookie.
async function issueRefreshCookie(res, userId) {
  const refreshToken = generateRefreshToken(userId);
  await db.saveRefreshToken({
    user_id: userId,
    token_hash: hashToken(refreshToken),
    expires_at: refreshTokenExpiry(),
  });
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
}

router.post("/login", sanitizeBody({ email: "string", password: "string" }), async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await login(email, password); // { token, user }
    await issueRefreshCookie(res, result.user.id);
    res.json(result); // access token in body, refresh token in httpOnly cookie
  } catch (e) { next(e); }
});

// Rotate: verify the refresh cookie, ensure it is the token we stored and is
// not expired, then issue a fresh access token AND a fresh refresh token,
// deleting the old one. Returns { token } — the new access token.
router.post("/refresh", async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) return res.status(401).json({ error: "missing refresh token" });

    let payload;
    try {
      payload = verifyRefreshToken(raw);
    } catch {
      res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
      return res.status(401).json({ error: "invalid refresh token" });
    }

    const hash = hashToken(raw);
    const stored = await db.findRefreshToken(hash);
    if (!stored || new Date(stored.expires_at).getTime() <= Date.now()) {
      if (stored) await db.deleteRefreshToken(hash);
      res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
      return res.status(401).json({ error: "refresh token expired" });
    }

    const userId = payload.sub;

    // Rotation: drop the presented token, mint a fresh one.
    await db.deleteRefreshToken(hash);
    await issueRefreshCookie(res, userId);

    // Full-claim access token (email included) so the session matches login.
    const admin = await db.getAdminById(userId);
    const token = signAccessToken(admin || { id: userId });
    res.json({ token });
  } catch (e) { next(e); }
});

// Logout: revoke the stored refresh token and clear the cookie.
router.post("/logout", async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) {
      try { await db.deleteRefreshToken(hashToken(raw)); } catch {}
    }
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get("/me", authGuard, (req, res) => {
  res.json({ id: req.user.sub, email: req.user.email });
});

// ── Admin account management (authenticated admins only) ──────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// List existing admins (no password hashes) for the account manager table.
router.get("/admins", authGuard, async (_req, res, next) => {
  try {
    res.json(await db.getAllAdmins());
  } catch (e) { next(e); }
});

// Create a new admin account. Validates email + password, rejects duplicates.
router.post("/register", authGuard, sanitizeBody({ email: "string", password: "string" }), async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) {
      throw Object.assign(new Error("a valid email is required"), { status: 400 });
    }
    if (!password || password.length < 8) {
      throw Object.assign(new Error("password must be at least 8 characters"), { status: 400 });
    }
    if (await db.getAdminByEmail(email)) {
      return res.status(409).json({ error: "an admin with that email already exists" });
    }
    const user = await db.createAdmin({ email, password_hash: await hashPassword(password) });
    res.status(201).json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (e) { next(e); }
});

// Delete an admin. An admin may not delete their own account.
router.delete("/admins/:id", authGuard, async (req, res, next) => {
  try {
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ error: "you cannot delete your own account" });
    }
    await db.deleteAdminById(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;

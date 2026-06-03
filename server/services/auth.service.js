import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";

const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

export async function login(email, password) {
  if (!email || !password) {
    throw Object.assign(new Error("email and password required"), { status: 400 });
  }
  const admin = await db.getAdminByEmail(email);
  if (!admin) throw Object.assign(new Error("invalid credentials"), { status: 401 });
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) throw Object.assign(new Error("invalid credentials"), { status: 401 });

  const token = signAccessToken(admin);
  return { token, user: { id: admin.id, email: admin.email } };
}

/** Sign a short-lived (8h) access token for an admin row. */
export function signAccessToken(admin) {
  return jwt.sign(
    { sub: admin.id, email: admin.email },
    process.env.JWT_SECRET || "",
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

/**
 * Generate a long-lived (30d) refresh token. It is a separate JWT signed with
 * JWT_REFRESH_SECRET and carries type: 'refresh' so it can never be mistaken
 * for an access token. Only its SHA-256 hash is persisted server-side.
 */
export function generateRefreshToken(userId) {
  return jwt.sign(
    { sub: userId, type: "refresh" },
    process.env.JWT_REFRESH_SECRET || "",
    { expiresIn: REFRESH_EXPIRES_IN }
  );
}

/**
 * Verify a refresh token's signature and type. Throws (status 401) when the
 * signature is invalid/expired or it is not a refresh token.
 */
export function verifyRefreshToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET || "");
  } catch {
    throw Object.assign(new Error("invalid or expired refresh token"), { status: 401 });
  }
  if (payload?.type !== "refresh") {
    throw Object.assign(new Error("invalid refresh token"), { status: 401 });
  }
  return payload;
}

/** Deterministic hash for storing / looking up a refresh token (never the raw token). */
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Date when a freshly issued refresh token expires (for the DB row + cookie maxAge). */
export function refreshTokenExpiry() {
  const m = String(REFRESH_EXPIRES_IN).match(/^(\d+)\s*([smhd])?$/);
  const n = m ? parseInt(m[1], 10) : 30;
  const unit = m?.[2] || "d";
  const ms = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[unit] || 864e5;
  return new Date(Date.now() + n * ms);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

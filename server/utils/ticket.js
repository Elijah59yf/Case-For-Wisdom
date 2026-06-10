// Ticket reference generator.
//
// Produces a human-readable, collision-checked reference of the form
//   CFW-{SLUG_PREFIX}-{RANDOM6}
// e.g. CFW-WISD-X7K2P9
//
// SLUG_PREFIX = first 4 chars of the event slug, uppercased and padded.
// RANDOM6     = 6 crypto-random alphanumeric chars.
//
// Uniqueness is verified against the DB (db.getRegistrationByTicketRef) and
// regenerated on collision, up to 5 attempts.

import { randomBytes } from "node:crypto";

// Unambiguous alphabet — no 0/O/1/I/L to keep refs easy to read aloud.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomChars(n) {
  const bytes = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function slugPrefix(slug) {
  const cleaned = String(slug || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return (cleaned + "XXXX").slice(0, 4);
}

/**
 * Generate a unique ticket reference.
 * @param {string} eventSlug
 * @param {object} db  adapter exposing getRegistrationByTicketRef(ref)
 * @returns {Promise<string>}
 */
export async function generateTicketRef(eventSlug, db) {
  const prefix = slugPrefix(eventSlug);
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = `CFW-${prefix}-${randomChars(6)}`;
    const existing = await db.getRegistrationByTicketRef(ref);
    if (!existing) return ref;
  }
  throw Object.assign(
    new Error("could not generate a unique ticket reference"),
    { status: 500 }
  );
}

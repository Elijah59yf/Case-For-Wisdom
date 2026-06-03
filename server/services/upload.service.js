import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import sharp from "sharp";

const adapter = (process.env.UPLOAD_ADAPTER || "local").toLowerCase();
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_WIDTH = 1920;

// Accepted input types and the magic-byte signature we expect to find.
const ACCEPTED = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // "RIFF" (WEBP container)
};

function matchesSignature(buffer, signatures) {
  return signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte));
}

async function ensureDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

/**
 * Validate the claimed MIME type, the declared size, and the real magic bytes,
 * then normalize to a resized WebP buffer with a random UUID name.
 */
async function processImage(file) {
  if (!file) throw Object.assign(new Error("no file provided"), { status: 400 });

  if (!ACCEPTED[file.mimetype]) {
    throw Object.assign(
      new Error("unsupported file type — only JPEG, PNG, and WebP are allowed"),
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) {
    throw Object.assign(new Error("file exceeds the 5MB limit"), { status: 413 });
  }
  // The claimed mimetype must agree with the actual file signature.
  if (!matchesSignature(file.buffer, ACCEPTED[file.mimetype])) {
    throw Object.assign(
      new Error("file contents do not match the declared image type"),
      { status: 415 }
    );
  }

  // Resize (only down) and convert everything to WebP for storage efficiency.
  let webp;
  try {
    webp = await sharp(file.buffer)
      .rotate() // honor EXIF orientation
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw Object.assign(new Error("could not process image"), { status: 422 });
  }

  return { buffer: webp, name: `${uuid()}.webp`, contentType: "image/webp" };
}

async function saveLocal({ buffer, name }) {
  await ensureDir();
  const dest = path.join(UPLOAD_DIR, name);
  await fs.writeFile(dest, buffer);
  return { url: `/uploads/${name}`, name };
}

async function saveSupabase({ buffer, name, contentType }) {
  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supa.storage.from("uploads").upload(name, buffer, {
    contentType, upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supa.storage.from("uploads").getPublicUrl(name);
  return { url: data.publicUrl, name };
}

export async function saveFile(file) {
  const processed = await processImage(file);
  if (adapter === "supabase") return saveSupabase(processed);
  return saveLocal(processed);
}

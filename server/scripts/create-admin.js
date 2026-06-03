#!/usr/bin/env node
/**
 * create-admin.js — standalone CLI for creating an admin account.
 *
 * Usage:
 *   node server/scripts/create-admin.js   (or: npm run create-admin from server/)
 *
 * Prompts for a username + password (password input is concealed), validates
 * them, then inserts a bcrypt-hashed row into admin_users. The admin_users
 * table keys on `email`, so the username is stored in that column — the value
 * you type here is exactly what you log in with.
 */
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load server/.env regardless of the cwd the script is launched from.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Imported after dotenv so the pool reads the loaded connection vars.
const { getPool, closePool } = await import("../db/mariadb-pool.js");

const USERNAME_RE = /^[A-Za-z0-9_-]+$/;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** Plain prompt — the typed answer is echoed normally. */
function ask(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

/**
 * Hidden prompt — turns on the ANSI "conceal" attribute (\x1B[8m) so readline's
 * echo is invisible, then resets it (\x1B[28m) once the line is submitted.
 */
function askHidden(rl, query) {
  return new Promise((resolve) => {
    process.stdout.write(query);
    process.stdout.write("\x1B[8m");
    rl.question("", (value) => {
      process.stdout.write("\x1B[28m");
      resolve(value);
    });
  });
}

function validate(username, password, confirm) {
  if (username.length < 3 || username.length > 50) {
    return "username must be between 3 and 50 characters";
  }
  if (!USERNAME_RE.test(username)) {
    return "username may only contain letters, numbers, underscores and hyphens";
  }
  if (password.length < 8) {
    return "password must be at least 8 characters";
  }
  if (password !== confirm) {
    return "passwords do not match";
  }
  return null;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let pool;
  try {
    const username = (await ask(rl, "Username: ")).trim();
    const password = await askHidden(rl, "Password: ");
    const confirm = await askHidden(rl, "Confirm password: ");
    rl.close();

    const error = validate(username, password, confirm);
    if (error) fail(error);

    pool = getPool();

    const [rows] = await pool.query(
      "SELECT id FROM admin_users WHERE email = ? LIMIT 1",
      [username]
    );
    if (rows.length > 0) fail("Username already taken");

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO admin_users (email, password_hash) VALUES (?, ?)",
      [username, passwordHash]
    );

    console.log(`Admin account created: ${username}`);
  } catch (err) {
    fail(err.message || String(err));
  } finally {
    if (!rl.closed) rl.close();
    await closePool();
  }
}

main();

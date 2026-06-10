// Shared SQLCipher-backed bun:sqlite connection.
//
// Encryption at rest is provided by pointing bun:sqlite at a SQLCipher build via
// Database.setCustomSQLite(), then `PRAGMA key` as the first operation on every
// connection. Stock SQLite silently ignores `PRAGMA key` and returns an empty
// `cipher_version` — we treat that as a fatal misconfiguration (fail closed).
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

function defaultLib() {
  if (process.env.SQLCIPHER_LIB) return process.env.SQLCIPHER_LIB;
  if (process.platform === "darwin") {
    return "/opt/homebrew/lib/libsqlcipher.dylib";
  }
  // Linux (Debian/oven-bun base): libsqlcipher0 installs here.
  return "/usr/lib/libsqlcipher.so";
}

export const SQLCIPHER_LIB = defaultLib();
export const DB_PATH =
  process.env.DATABASE_PATH || "./data/diaetendeckel.db";

let customSet = false;
function ensureCustomSqlite() {
  if (customSet) return;
  Database.setCustomSQLite(SQLCIPHER_LIB);
  customSet = true;
}

function requireKey(key) {
  const k = key ?? process.env.DATABASE_ENCRYPTION_KEY ?? "";
  if (!k) {
    throw new Error(
      "DATABASE_ENCRYPTION_KEY is required — the database is encrypted at rest (SQLCipher).",
    );
  }
  return k;
}

// Apply the encryption key + standard pragmas. The key MUST be applied before
// any other statement, and journal_mode only after keying.
export function applyKeyAndPragmas(database, key) {
  const k = requireKey(key);
  database.run(`PRAGMA key = '${k.replace(/'/g, "''")}'`);
  const row = database.query("PRAGMA cipher_version").get();
  if (!row || !row.cipher_version) {
    throw new Error(
      `SQLCipher is not active (empty cipher_version). Check SQLCIPHER_LIB=${SQLCIPHER_LIB}.`,
    );
  }
  database.run("PRAGMA journal_mode = WAL");
  database.run("PRAGMA foreign_keys = ON");
  database.run("PRAGMA busy_timeout = 5000");
  return database;
}

// Open a fresh encrypted connection to an arbitrary path (used by backup,
// restore and migration which need their own short-lived handles).
export function openEncrypted(path, key) {
  ensureCustomSqlite();
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path, { create: true });
  applyKeyAndPragmas(database, key);
  return database;
}

// The process-wide shared connection used by the app, setup and seed.
export const db = openEncrypted(DB_PATH);

export function nowIso() {
  return new Date().toISOString();
}

// ISO-8601 string for a moment `ms` milliseconds in the past (replaces
// Postgres `NOW() - INTERVAL '…'`). ISO-8601 UTC strings compare correctly
// with lexicographic `>` since all stored timestamps use the same format.
export function isoAgo(ms) {
  return new Date(Date.now() - ms).toISOString();
}

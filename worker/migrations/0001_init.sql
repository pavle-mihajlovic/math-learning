-- B12: Road to Rudin sync database (Cloudflare D1). Single user.

-- The attempt log, append-only. `seq` is the server's order, used as the sync cursor.
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  t INTEGER NOT NULL,
  body TEXT NOT NULL,
  received INTEGER NOT NULL
);

-- One-time email login codes (hashed). One row: there is only one account.
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
);

-- Signed-in devices. Only a hash of the session token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT ''
);

-- Pairing codes shown as a QR code on a signed-in device (hashed, single use, short-lived).
CREATE TABLE IF NOT EXISTS pairings (
  hash TEXT PRIMARY KEY,
  expires INTEGER NOT NULL
);

-- Simple fixed-window rate limits.
CREATE TABLE IF NOT EXISTS throttle (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

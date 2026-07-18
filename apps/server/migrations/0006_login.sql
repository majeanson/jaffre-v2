-- Real login on top of guest identity: a user may link a verified email
-- and/or a Google account. Guests stay fully functional without either.
-- Migrations are forward-only and filename-locked: never edit an applied one.

-- users.email exists since 0001 ("reserved for a future registered-account
-- upgrade" — that future is now) with UNIQUE already declared inline. Only
-- the Google link is new. SQLite unique indexes treat NULLs as distinct, so
-- unlinked users coexist freely while a linked sub maps to exactly ONE user.
ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub);

-- One-time email login codes: hash-at-rest (sha256 of email:code), short TTL,
-- attempt-capped. Rows double as the rate-limit ledger (count by email/ip).
CREATE TABLE IF NOT EXISTS login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS login_codes_email ON login_codes(email, created_at);
CREATE INDEX IF NOT EXISTS login_codes_ip ON login_codes(ip, created_at);

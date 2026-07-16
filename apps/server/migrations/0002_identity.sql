-- M9: unify identity around the server token uid + 3-word recovery.
-- Migrations are forward-only and filename-locked: never edit an applied one,
-- add the next number instead.

ALTER TABLE users ADD COLUMN recovery_hash TEXT;
ALTER TABLE users ADD COLUMN color TEXT;

-- W4: persist a player's painted card alongside their chosen colour.
-- Migrations are forward-only and filename-locked: never edit an applied one,
-- add the next number instead. Additive + nullable so it is safe to apply to a
-- live table (existing rows keep NULL = "no painting yet").

ALTER TABLE users ADD COLUMN paint TEXT;

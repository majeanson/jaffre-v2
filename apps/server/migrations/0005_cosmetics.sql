-- Cosmetics: persist a player's chosen card skin + theme alongside their
-- colour/paint. Migrations are forward-only and filename-locked: never edit an
-- applied one, add the next number instead. Additive + nullable so it is safe
-- to apply to a live table (existing rows keep NULL = "default look").

ALTER TABLE users ADD COLUMN card_skin TEXT;
ALTER TABLE users ADD COLUMN theme TEXT;

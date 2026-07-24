-- Bonhomme skin: persist the player's chosen 0-card figure art (pixel /
-- painted / og) alongside card_skin/theme. Migrations are forward-only and
-- filename-locked: never edit an applied one, add the next number instead.
-- Additive + nullable so it is safe to apply to a live table (existing rows
-- keep NULL = "default look", i.e. 'painted').

ALTER TABLE users ADD COLUMN bonhomme_skin TEXT;

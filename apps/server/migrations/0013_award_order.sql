-- Trophy shelf: the player's chosen arrangement of their earned awards, as a
-- JSON array of award ids. Display-only — it never affects what is earned, and
-- an id that is absent, unknown or duplicated is ignored on read, so a stale
-- arrangement can never hide a trophy.
--
-- Migrations are forward-only and filename-locked: never edit an applied one,
-- add the next number instead. Additive + nullable so it is safe to apply to a
-- live table (existing rows keep NULL = "catalog order").

ALTER TABLE users ADD COLUMN award_order TEXT;

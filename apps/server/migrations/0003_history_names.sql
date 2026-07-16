-- M10: player names + per-round summaries on history rows (stats).
-- Migrations are forward-only and filename-locked: never edit an applied one,
-- add the next number instead.

ALTER TABLE game_players ADD COLUMN name TEXT;
ALTER TABLE games ADD COLUMN round_summaries TEXT;

-- Spectator recognition: watching a game through to the end is the only thing
-- a player can do in this app that leaves no trace at all.
--
-- Deliberately NOT folded into XP. The XP constants in
-- apps/web/src/progression.ts are documented as frozen because they define
-- what a level means; adding a source would silently re-level the whole
-- population for the least skill-bearing activity in the game. This is its own
-- counter, and it pays out as awards.
--
-- One row per (user, game) so the count can't be inflated by rejoining: the
-- PRIMARY KEY is the dedupe. Only written when a spectator is still attached
-- at game_over — watching the END is the meaningful unit, not opening a tab.
--
-- Migrations are forward-only and filename-locked: never edit an applied one.

CREATE TABLE IF NOT EXISTS spectated_games (
  user_id    TEXT NOT NULL,
  game_id    TEXT NOT NULL,
  watched_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_spectated_user ON spectated_games (user_id);

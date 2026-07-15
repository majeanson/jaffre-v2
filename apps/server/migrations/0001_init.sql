-- M8: accounts + game history.
-- Migrations are forward-only and filename-locked: never edit an applied one,
-- add the next number instead.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE, -- NULL for guests; reserved for a future registered-account upgrade
  pw_hash TEXT, -- NULL for guests
  created_at INTEGER NOT NULL
);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  seed INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  winner_team INTEGER,
  score_0 INTEGER,
  score_1 INTEGER,
  -- JSON array of the room's ordered action log — enough to replay the game
  -- deterministically together with `seed`.
  action_log TEXT
);

CREATE TABLE game_players (
  game_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  -- Soft ref to users.id (no FK): deleting a user must never cascade history.
  user_id TEXT,
  is_bot INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, seat)
);

CREATE INDEX idx_game_players_user ON game_players (user_id);
CREATE INDEX idx_games_finished ON games (finished_at);

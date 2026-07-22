-- Elo-like skill rating for the leaderboard. Per-user aggregates didn't exist
-- (stats were recomputed on read); a global ladder needs a stored rating that
-- updates per finished game. rating_games gates who appears on the board.
-- Migrations are forward-only and filename-locked: never edit an applied one.

ALTER TABLE users ADD COLUMN rating REAL NOT NULL DEFAULT 1000;
ALTER TABLE users ADD COLUMN rating_games INTEGER NOT NULL DEFAULT 0;

-- Supports the leaderboard's ORDER BY rating DESC (filtered on rating_games).
CREATE INDEX IF NOT EXISTS users_rating ON users(rating);

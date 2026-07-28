-- Deal Board: one seeded deal, the same for everyone, scored to a board.
--
-- One row per (challenge, user) — a challenge is a single attempt, so the
-- PRIMARY KEY is the anti-retry rule rather than a constraint bolted on later:
-- an INSERT that collides is a second try, and is refused.
--
-- Scores are only ever written after the server has re-played the submitted
-- action log (see src/challenge.ts), so this table holds verified results, not
-- claims. `tricks` is stored as the tie-break and costs nothing to keep.
--
-- Migrations are forward-only and filename-locked: never edit an applied one,
-- add the next number instead.

CREATE TABLE IF NOT EXISTS challenge_scores (
  challenge_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  score        INTEGER NOT NULL,
  tricks       INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, user_id)
);

-- The board query: one challenge, best first. Covers the ORDER BY so the
-- daily board stays a single index scan as the table grows.
CREATE INDEX IF NOT EXISTS idx_challenge_scores_board
  ON challenge_scores (challenge_id, score DESC, tricks DESC, created_at ASC);

-- "How many days in a row have you played?" — a per-user scan by recency.
CREATE INDEX IF NOT EXISTS idx_challenge_scores_user
  ON challenge_scores (user_id, created_at DESC);

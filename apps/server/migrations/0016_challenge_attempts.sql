-- Deal Board: a per-user, per-day counter of VERIFICATION attempts.
--
-- Submitting a run is the most expensive thing an anonymous caller can ask
-- this worker to do: verifyChallengeRun re-creates the deal, folds the whole
-- action log through the engine, and recomputes every bot move from the bot
-- policy to prove none of them were tampered with. That work is the point —
-- it is what makes a score unfakeable — but it also means one POST buys a lot
-- of CPU, and nothing was counting them.
--
-- The challenge_scores PRIMARY KEY already stops a player scoring twice, so
-- the exposure is REJECTED runs: they insert nothing, so they can be repeated
-- forever. This table closes that. One row per (user, UTC day), incremented
-- before the fold, so the cap covers exactly the expensive path.
--
-- Deliberately keyed by UTC day rather than a rolling window: it matches how
-- a daily challenge already thinks about time (utcDayKey), and it means the
-- row set is small and self-expiring in meaning — an old day's row is inert.
--
-- Migrations are forward-only and filename-locked: never edit an applied one.

CREATE TABLE IF NOT EXISTS challenge_attempts (
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day_key)
);

-- Awards / achievements: the first server-side entitlement layer. Ownership of
-- cosmetics was previously derived live from /api/stats with no persisted
-- grant; awards need a durable "earned" record so event-based awards (e.g.
-- finishing the tutorial) and their cosmetic rewards follow the account.
-- Migrations are forward-only and filename-locked: never edit an applied one.

-- One row per (user, award) once earned. Soft ref to users.id (no FK, matching
-- game_players/push_subscriptions). granted_at is the earn timestamp (ms).
CREATE TABLE IF NOT EXISTS user_awards (
  user_id TEXT NOT NULL,
  award_id TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, award_id)
);
CREATE INDEX IF NOT EXISTS user_awards_user ON user_awards(user_id);

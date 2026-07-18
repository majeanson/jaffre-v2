-- Web Push subscriptions: one row per browser endpoint, soft-keyed on the
-- user id (like game_players — no FK). A user can hold several (phone +
-- desktop); dead endpoints are pruned on 404/410 from the push service.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user_id);

-- Daily counters for client telemetry beacons. Beacons themselves are only
-- ever logged (never stored, see handleTelemetry) — this table gives that
-- stream a queryable pulse: how many of each kind landed on a given day.
-- Migrations are forward-only and filename-locked: never edit an applied one.

CREATE TABLE IF NOT EXISTS telemetry_counts (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);

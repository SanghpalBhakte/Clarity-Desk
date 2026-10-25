-- Clarity Desk closed-app reminders (D1). Apply with:
--   npx wrangler@latest d1 execute clarity-desk-push --remote --file=schema.sql

-- One row per phone/browser. No name, email or account: an anonymous id,
-- the hash of its secret, and the Web Push subscription.
CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  secret_hash  TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_sync_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS devices_endpoint ON devices (endpoint);

-- Only what a notification needs. fire_at is UTC milliseconds. Rows are
-- deleted once sent (sent = 1 only while a cron run is sending them).
CREATE TABLE IF NOT EXISTS reminders (
  device_id   TEXT NOT NULL,
  reminder_id TEXT NOT NULL,
  fire_at     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  url         TEXT NOT NULL,
  tag         TEXT NOT NULL,
  sent        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, reminder_id)
);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders (sent, fire_at);
CREATE INDEX IF NOT EXISTS reminders_fire ON reminders (fire_at);

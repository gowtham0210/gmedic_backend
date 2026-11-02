-- A portal user's choices about which notifications reach their bell (config/notificationPreferences.js).
-- Only choices are stored: no row means the notification is on.
CREATE TABLE user_notification_prefs (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  pref_key   TEXT NOT NULL CHECK (length(pref_key) BETWEEN 1 AND 40),
  enabled    INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, pref_key)
);

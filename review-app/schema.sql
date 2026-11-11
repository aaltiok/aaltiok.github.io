CREATE TABLE IF NOT EXISTS review_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  records TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  write_id TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  action TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_comments (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT PRIMARY KEY,
  bucket INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS events_by_time ON review_events(at);
CREATE INDEX IF NOT EXISTS comments_by_time ON review_comments(at);

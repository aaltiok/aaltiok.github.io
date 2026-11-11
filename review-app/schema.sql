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
CREATE TABLE IF NOT EXISTS document_exceptions (
  doc_id TEXT PRIMARY KEY, type TEXT NOT NULL, category TEXT NOT NULL,
  actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_hidden_comments (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS review_changes (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL,
  before_json TEXT NOT NULL, after_json TEXT NOT NULL,
  undone INTEGER NOT NULL DEFAULT 0, redo_available INTEGER NOT NULL DEFAULT 1,
  undone_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS changes_by_actor ON review_changes(actor,undone);
CREATE INDEX IF NOT EXISTS exceptions_by_type ON document_exceptions(type);
CREATE TABLE IF NOT EXISTS corpus_evidence (
  doc_id TEXT PRIMARY KEY, included INTEGER NOT NULL, type TEXT NOT NULL,
  title TEXT NOT NULL, year TEXT NOT NULL, reason TEXT NOT NULL,
  details TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS evidence_by_type ON corpus_evidence(included,type);

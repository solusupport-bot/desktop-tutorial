CREATE TABLE IF NOT EXISTS reply_jobs (
  comment_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('public_reply', 'private_reply')),
  public_text TEXT NOT NULL,
  private_text TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  due_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  attempted_at INTEGER,
  completed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_reply_jobs_due ON reply_jobs(status, due_at);
CREATE INDEX IF NOT EXISTS idx_reply_jobs_user ON reply_jobs(user_id, status, completed_at);

CREATE TABLE IF NOT EXISTS runtime_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO runtime_state (id) VALUES (1);

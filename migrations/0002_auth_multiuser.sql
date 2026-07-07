-- Users & sessions for auth
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  name TEXT,
  password_hash TEXT,             -- null for demo/google accounts
  auth_provider TEXT DEFAULT 'email', -- email | google | demo
  is_demo INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Reserve user id 1 for legacy/seed data so new signups never inherit it
INSERT OR IGNORE INTO users (id, email, name, auth_provider, is_demo)
VALUES (1, 'legacy-seed@myconnecthub.app', 'Legacy Seed', 'demo', 1);

-- Scope contacts per user
ALTER TABLE contacts ADD COLUMN user_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);

-- Rebuild my_interests with per-user uniqueness
CREATE TABLE IF NOT EXISTS my_interests_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL COLLATE NOCASE,
  category TEXT DEFAULT 'general',
  UNIQUE(user_id, name)
);
INSERT OR IGNORE INTO my_interests_v2 (user_id, name, category)
  SELECT 1, name, category FROM my_interests;
DROP TABLE my_interests;
ALTER TABLE my_interests_v2 RENAME TO my_interests;
CREATE INDEX IF NOT EXISTS idx_myint_user ON my_interests(user_id);

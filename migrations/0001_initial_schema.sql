-- Contacts: unified person record merged from all sources
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  location TEXT,
  notes TEXT,
  avatar_color TEXT DEFAULT '#6366f1',
  relationship_type TEXT DEFAULT 'unknown', -- friend | business | family | acquaintance | unknown
  strength INTEGER DEFAULT 1,               -- 1-5 relationship strength score
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Which platform(s) each contact came from (a contact can exist on many)
CREATE TABLE IF NOT EXISTS contact_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  platform TEXT NOT NULL, -- phone | email | linkedin | facebook | instagram | tiktok | manual
  handle TEXT,            -- username / profile URL on that platform
  imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  UNIQUE(contact_id, platform)
);

-- Interests / tags attached to contacts
CREATE TABLE IF NOT EXISTS interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL COLLATE NOCASE,
  category TEXT DEFAULT 'general' -- general | business | hobby | industry
);

CREATE TABLE IF NOT EXISTS contact_interests (
  contact_id INTEGER NOT NULL,
  interest_id INTEGER NOT NULL,
  PRIMARY KEY (contact_id, interest_id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (interest_id) REFERENCES interests(id) ON DELETE CASCADE
);

-- My own interests (used for matching against contacts)
CREATE TABLE IF NOT EXISTS my_interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL COLLATE NOCASE,
  category TEXT DEFAULT 'general'
);

-- Computed matches between contacts (mutual interests / same company / etc.)
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_a INTEGER NOT NULL,
  contact_b INTEGER NOT NULL,
  match_type TEXT NOT NULL,   -- shared_interest | same_company | same_location | multi_platform
  match_detail TEXT,          -- e.g. the interest name or company name
  score INTEGER DEFAULT 1,
  computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_a) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_b) REFERENCES contacts(id) ON DELETE CASCADE,
  UNIQUE(contact_a, contact_b, match_type, match_detail)
);

-- Interaction log (calls, meetings, notes)
CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  kind TEXT DEFAULT 'note',  -- note | call | meeting | email | message
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(full_name);
CREATE INDEX IF NOT EXISTS idx_sources_contact ON contact_sources(contact_id);
CREATE INDEX IF NOT EXISTS idx_ci_contact ON contact_interests(contact_id);
CREATE INDEX IF NOT EXISTS idx_matches_a ON matches(contact_a);
CREATE INDEX IF NOT EXISTS idx_matches_b ON matches(contact_b);

-- Demo contacts across platforms
INSERT OR IGNORE INTO contacts (id, full_name, first_name, last_name, email, phone, company, job_title, location, relationship_type, strength, avatar_color) VALUES
  (1, 'Ava Martinez', 'Ava', 'Martinez', 'ava.martinez@example.com', '+15551230001', 'Sunset Films', 'Executive Producer', 'Los Angeles', 'business', 5, '#ec4899'),
  (2, 'Ben Carter', 'Ben', 'Carter', 'ben.carter@example.com', '+15551230002', 'Sunset Films', 'Director of Photography', 'Los Angeles', 'business', 4, '#6366f1'),
  (3, 'Chloe Nguyen', 'Chloe', 'Nguyen', 'chloe.n@example.com', '+15551230003', 'StreamVerse', 'Content Strategist', 'New York', 'friend', 4, '#14b8a6'),
  (4, 'David Okafor', 'David', 'Okafor', 'd.okafor@example.com', '+15551230004', 'Bright Media', 'Talent Agent', 'Los Angeles', 'business', 3, '#f59e0b'),
  (5, 'Emma Rossi', 'Emma', 'Rossi', 'emma.rossi@example.com', '+15551230005', 'StreamVerse', 'VP Development', 'New York', 'business', 5, '#8b5cf6'),
  (6, 'Frank Liu', 'Frank', 'Liu', 'frank.liu@example.com', '+15551230006', NULL, 'Screenwriter', 'Los Angeles', 'friend', 4, '#ef4444'),
  (7, 'Grace Kim', 'Grace', 'Kim', 'grace.kim@example.com', '+15551230007', 'Bright Media', 'Social Media Lead', 'Chicago', 'acquaintance', 2, '#0ea5e9'),
  (8, 'Hassan Ali', 'Hassan', 'Ali', 'hassan.ali@example.com', '+15551230008', NULL, 'Film Composer', 'New York', 'friend', 3, '#22c55e');

INSERT OR IGNORE INTO contact_sources (contact_id, platform, handle) VALUES
  (1, 'phone', NULL), (1, 'linkedin', 'linkedin.com/in/avamartinez'), (1, 'instagram', '@ava.makesfilms'),
  (2, 'phone', NULL), (2, 'email', NULL),
  (3, 'email', NULL), (3, 'tiktok', '@chloecreates'), (3, 'instagram', '@chloe.n'),
  (4, 'linkedin', 'linkedin.com/in/dokafor'),
  (5, 'linkedin', 'linkedin.com/in/emmarossi'), (5, 'email', NULL),
  (6, 'phone', NULL), (6, 'facebook', 'fb.com/frankliuwrites'),
  (7, 'instagram', '@gracekim'), (7, 'tiktok', '@gracekim'),
  (8, 'phone', NULL), (8, 'facebook', 'fb.com/hassanali.music');

INSERT OR IGNORE INTO interests (id, name, category) VALUES
  (1, 'Film Production', 'industry'),
  (2, 'Screenwriting', 'hobby'),
  (3, 'Golf', 'hobby'),
  (4, 'Streaming & TV', 'industry'),
  (5, 'Photography', 'hobby'),
  (6, 'Networking Events', 'business'),
  (7, 'Music Scoring', 'industry');

INSERT OR IGNORE INTO contact_interests (contact_id, interest_id) VALUES
  (1, 1), (1, 4), (1, 6),
  (2, 1), (2, 5),
  (3, 4), (3, 6),
  (4, 1), (4, 3),
  (5, 4), (5, 6), (5, 3),
  (6, 2), (6, 1),
  (7, 4),
  (8, 7), (8, 1);

INSERT OR IGNORE INTO my_interests (name, category) VALUES
  ('Film Production', 'industry'),
  ('Streaming & TV', 'industry'),
  ('Golf', 'hobby');

INSERT OR IGNORE INTO interactions (contact_id, kind, content) VALUES
  (1, 'meeting', 'Coffee at Sunset lot — discussed co-production for spring slate'),
  (3, 'call', 'Caught up about the StreamVerse pitch window'),
  (5, 'email', 'Sent one-pager for the docu-series concept');

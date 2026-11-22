CREATE TABLE IF NOT EXISTS visitors (
  ip_hash   TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
  ip_hash    TEXT PRIMARY KEY,
  vote       TEXT NOT NULL CHECK (vote IN ('like', 'dislike')),
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_votes_vote ON votes (vote);

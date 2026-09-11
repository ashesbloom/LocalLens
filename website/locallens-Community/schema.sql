-- Community board storage. Applied with:
--   npm run db:init      (local)   /   npm run db:reset  to drop and rebuild it
--
-- Custom tags live on the post that used them rather than in a tags table: no join to write,
-- no orphan row when the last post using a tag goes, and the filter list is one GROUP BY.

CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,    -- base36 timestamp + noise; sorts by time, leaks no count
  author     TEXT NOT NULL,       -- display name, trimmed and capped by validatePost
  tag        TEXT NOT NULL,       -- slug, built-in or custom
  tag_label  TEXT,                -- NULL for built-ins; the typed text for custom tags
  body       TEXT NOT NULL,       -- raw markdown, never HTML
  created    INTEGER NOT NULL,    -- epoch ms
  edited     INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  ip_hash    TEXT NOT NULL,       -- salted SHA-256; never returned by any endpoint

  -- Ownership without accounts. The plaintext token is handed to the browser once, at
  -- creation, and only its hash is kept here -- so a copy of this table does not let anyone
  -- delete or edit the posts in it.
  token_hash TEXT,

  -- Vote tallies, kept beside the post and written in the same batch as the vote row. The
  -- feed then orders by score without touching the votes table at all.
  score      INTEGER NOT NULL DEFAULT 0,
  ups        INTEGER NOT NULL DEFAULT 0,
  downs      INTEGER NOT NULL DEFAULT 0,
  replies    INTEGER NOT NULL DEFAULT 0  -- kept beside the post, same reasoning as score below
);

-- The feed, and the feed filtered by tag. Ordering by id is why id is time-sortable:
-- "newest first" is an index walk rather than a sort over the table.
CREATE INDEX IF NOT EXISTS posts_feed ON posts (hidden, id DESC);
CREATE INDEX IF NOT EXISTS posts_tag  ON posts (hidden, tag, id DESC);

-- The top sort. Compound so its keyset cursor (score, then id) is covered end to end.
CREATE INDEX IF NOT EXISTS posts_top ON posts (hidden, score DESC, id DESC);

-- Rate limiting reads this one and nothing else.
CREATE INDEX IF NOT EXISTS posts_rate ON posts (ip_hash, created DESC);

-- One vote per address per post, enforced by the primary key rather than by a read-then-write
-- the application could get wrong. Changing your mind and voting twice become the same
-- statement: an upsert.
CREATE TABLE IF NOT EXISTS votes (
  post_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  value   INTEGER NOT NULL,      -- +1 or -1; withdrawing deletes the row
  created INTEGER NOT NULL,
  PRIMARY KEY (post_id, ip_hash)
);

CREATE INDEX IF NOT EXISTS votes_rate ON votes (ip_hash, created DESC);

CREATE TABLE IF NOT EXISTS uploads (
  key      TEXT PRIMARY KEY,     -- sha256 of the bytes; the R2 object key
  mime     TEXT NOT NULL,        -- from magic bytes, never from the request header
  bytes    INTEGER NOT NULL,
  created  INTEGER NOT NULL,
  ip_hash  TEXT NOT NULL,
  claimed  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS uploads_rate  ON uploads (ip_hash, created DESC);
CREATE INDEX IF NOT EXISTS uploads_sweep ON uploads (claimed, created);

-- Flat replies -- one level, no threading. A reply carries the same ownership shape as a
-- post (a token whose hash is stored, so its author alone can remove it) but none of a
-- post's other machinery: no tag, no votes, no edit window. Add those if they turn out to be
-- wanted; a comment box does not obviously need them yet.
CREATE TABLE IF NOT EXISTS replies (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL,
  author     TEXT NOT NULL,
  body       TEXT NOT NULL,
  created    INTEGER NOT NULL,
  hidden     INTEGER NOT NULL DEFAULT 0,
  ip_hash    TEXT NOT NULL,
  token_hash TEXT
);

-- Oldest first, per post -- a reply thread reads top to bottom like a conversation, not
-- newest-first like the main feed.
CREATE INDEX IF NOT EXISTS replies_post ON replies (post_id, hidden, id ASC);
CREATE INDEX IF NOT EXISTS replies_rate ON replies (ip_hash, created DESC);


-- Site visits. One row per visitor per day, which is what the primary key enforces: a
-- reload writes nothing, and nobody can inflate the number by posting in a loop. That makes
-- the count "visits" rather than raw page loads, and it is labelled that way everywhere it
-- is shown -- calling it "views" would be claiming something this table does not measure.
--
-- Deliberately no third column. A path, a referrer or a timestamp here would turn a counter
-- into a log of who read what, which is not what this site is for.
CREATE TABLE IF NOT EXISTS views (
  day     TEXT NOT NULL,     -- 'YYYY-MM-DD', UTC
  ip_hash TEXT NOT NULL,     -- salted SHA-256, the same hashIp() the board uses
  PRIMARY KEY (day, ip_hash)
);

-- One reading per day of the counts GitHub only ever reports as "right now". Without this
-- there is no history for stars, forks or issues at all, and a trend line for them would be
-- drawn from numbers nobody recorded.
--
-- PRIMARY KEY (day) plus INSERT OR REPLACE means the latest reading of the current day wins
-- and yesterday is never rewritten. There is no backfill and there cannot be one: these rows
-- start the day the endpoint first runs.
CREATE TABLE IF NOT EXISTS snapshots (
  day         TEXT PRIMARY KEY,  -- 'YYYY-MM-DD', UTC, matching the views table
  stars       INTEGER,
  forks       INTEGER,
  open_issues INTEGER
);

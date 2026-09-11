-- Used only by `npm run db:reset` against the local database. CREATE TABLE IF NOT EXISTS
-- will not add a column to a table that already exists, so changing the schema during
-- development means dropping first. Never point this at anything deployed.
DROP TABLE IF EXISTS replies;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS uploads;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS views;
DROP TABLE IF EXISTS snapshots;

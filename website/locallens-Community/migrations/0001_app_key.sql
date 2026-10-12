-- Links posts and replies to the LocalLens desktop app that opened the board, so the app can
-- show replies to your posts. schema.sql already has these columns for a fresh database; this
-- file brings an existing one up to date. Run once per database:
--   npx wrangler d1 execute locallens-community --remote --file=migrations/0001_app_key.sql
--   npx wrangler d1 execute locallens-community --local --persist-to=.wrangler/state --file=migrations/0001_app_key.sql
-- ALTER TABLE ... ADD COLUMN has no IF NOT EXISTS in SQLite, so a second run fails loudly on
-- the first line and changes nothing.
ALTER TABLE posts ADD COLUMN app_key_hash TEXT;
ALTER TABLE replies ADD COLUMN app_key_hash TEXT;
CREATE INDEX IF NOT EXISTS posts_appkey ON posts (app_key_hash) WHERE app_key_hash IS NOT NULL;

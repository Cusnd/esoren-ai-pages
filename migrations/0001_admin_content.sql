CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL CHECK (collection IN ('articles', 'papers', 'skills', 'mcp')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  frontmatter_json TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  published_commit_sha TEXT,
  UNIQUE (collection, slug)
);

CREATE INDEX IF NOT EXISTS idx_content_items_collection_updated
  ON content_items (collection, updated_at DESC);

CREATE TABLE IF NOT EXISTS content_revisions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'publish')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_revisions_item_created
  ON content_revisions (item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  commit_sha TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_publish_jobs_item_created
  ON publish_jobs (item_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_jobs_running_item
  ON publish_jobs (item_id)
  WHERE status = 'running';

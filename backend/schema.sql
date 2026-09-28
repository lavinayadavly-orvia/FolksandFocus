PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS intelligence_hcps (
  hcp_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  primary_specialty TEXT,
  medical_registration_year INTEGER CHECK (medical_registration_year IS NULL OR medical_registration_year >= 1950),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('PENDING', 'VERIFIED')),
  revision INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS intelligence_posts (
  platform TEXT NOT NULL,
  post_id TEXT NOT NULL,
  hcp_id TEXT NOT NULL REFERENCES intelligence_hcps(hcp_id),
  post_timestamp TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(platform, post_id),
  UNIQUE(platform, post_id, hcp_id)
);
CREATE TABLE IF NOT EXISTS intelligence_extractions (
  platform TEXT NOT NULL,
  post_id TEXT NOT NULL,
  hcp_id TEXT NOT NULL,
  extracted_archetype TEXT,
  pv_complete INTEGER NOT NULL CHECK (pv_complete IN (0, 1)),
  pv_review_required INTEGER NOT NULL CHECK (pv_review_required IN (0, 1)),
  review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING', 'CONFIRMED', 'DISMISSED')),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  PRIMARY KEY(platform, post_id),
  FOREIGN KEY(platform, post_id, hcp_id) REFERENCES intelligence_posts(platform, post_id, hcp_id)
);
CREATE TABLE IF NOT EXISTS intelligence_audit (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id TEXT NOT NULL,
  detail TEXT NOT NULL CHECK (json_valid(detail))
);
CREATE INDEX IF NOT EXISTS intelligence_hcp_time ON intelligence_posts(hcp_id, post_timestamp DESC);
CREATE INDEX IF NOT EXISTS intelligence_queue ON intelligence_posts(status, created_at);
CREATE INDEX IF NOT EXISTS intelligence_archetypes ON intelligence_extractions(extracted_archetype);
CREATE INDEX IF NOT EXISTS intelligence_pv ON intelligence_extractions(pv_review_required, review_status);

CREATE TABLE IF NOT EXISTS intelligence_network_candidates (
  account_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS intelligence_network_edges (
  seed_hcp_id TEXT NOT NULL REFERENCES intelligence_hcps(hcp_id),
  seed_account_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES intelligence_network_candidates(account_id),
  direction TEXT NOT NULL CHECK(direction IN ('followers','following')),
  source_url TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY(seed_hcp_id,seed_account_id,candidate_id,direction)
);
CREATE INDEX IF NOT EXISTS intelligence_network_candidate_edges ON intelligence_network_edges(candidate_id);
CREATE TABLE IF NOT EXISTS intelligence_network_runs (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  created_at TEXT NOT NULL
);

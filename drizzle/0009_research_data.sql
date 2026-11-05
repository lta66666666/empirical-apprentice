CREATE TABLE IF NOT EXISTS research_data (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 owner TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL,
 request_id TEXT NOT NULL, request_sha256 TEXT NOT NULL,
 UNIQUE(owner,session_id,request_id)
);
CREATE INDEX IF NOT EXISTS research_data_session ON research_data(session_id,owner);

CREATE TABLE ai_interpretations (
 owner TEXT NOT NULL, task_id TEXT NOT NULL,
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 result_key TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner,task_id,result_key)
);

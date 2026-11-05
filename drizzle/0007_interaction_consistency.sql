ALTER TABLE sessions ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN request_id TEXT;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN request_sha256 TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX jobs_request_once ON jobs(owner,session_id,request_id) WHERE request_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE local_stata_tasks ADD COLUMN request_id TEXT;
--> statement-breakpoint
ALTER TABLE local_stata_tasks ADD COLUMN request_sha256 TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX local_stata_tasks_request_once ON local_stata_tasks(owner,session_id,request_id) WHERE request_id IS NOT NULL;

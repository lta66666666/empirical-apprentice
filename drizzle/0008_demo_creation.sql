CREATE TABLE demo_creation_requests (
 owner TEXT NOT NULL,
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 PRIMARY KEY(owner,request_id)
);
--> statement-breakpoint
CREATE TABLE local_fixture_preparations (
 pairing_id TEXT PRIMARY KEY REFERENCES local_pairings(id) ON DELETE CASCADE,
 body TEXT NOT NULL
);

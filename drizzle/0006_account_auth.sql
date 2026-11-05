CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,primary_owner TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL);
CREATE TABLE account_owners(owner TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),kind TEXT NOT NULL,claimed_at INTEGER NOT NULL);
CREATE INDEX account_owners_user ON account_owners(user_id);
CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),expires_at INTEGER NOT NULL);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_attempts(id TEXT PRIMARY KEY,kind TEXT NOT NULL,source TEXT NOT NULL,username TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX auth_attempts_window ON auth_attempts(kind,created_at,source,username);

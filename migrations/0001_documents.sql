CREATE TABLE IF NOT EXISTS documents (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 collection TEXT NOT NULL,
 id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(collection,id)
);
CREATE INDEX IF NOT EXISTS documents_collection_seq ON documents(collection,seq);
CREATE TABLE IF NOT EXISTS collector_lock (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS identity_map (access_sub TEXT PRIMARY KEY, appdeploy_user_id TEXT NOT NULL UNIQUE);

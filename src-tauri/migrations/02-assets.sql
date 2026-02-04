-- Asset records for files copied into {app_local_data_dir}/assets
CREATE TABLE IF NOT EXISTS assets (
    -- Stable identifier for referencing assets (e.g., UUID)
    asset_id TEXT PRIMARY KEY,
    -- Filename stored in the assets directory
    filename TEXT NOT NULL,
    -- SHA256 hex digest of the file content
    sha256 TEXT NOT NULL,
    -- Originating client id (for sync purposes)
    client_id TEXT NOT NULL,
    -- Creation time of this asset record
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Optional JSON metadata (e.g., width/height for images)
    meta TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_filename ON assets(filename);
CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(sha256);
CREATE INDEX IF NOT EXISTS idx_assets_client_id ON assets(client_id);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at);

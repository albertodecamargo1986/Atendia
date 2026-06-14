-- Migration 006: Create software_releases table
-- Desktop application releases for auto-update system

CREATE TABLE software_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(20) NOT NULL UNIQUE,
    changelog TEXT,
    file_path TEXT NOT NULL,
    file_hash VARCHAR(128) NOT NULL,
    signature TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_software_releases_version ON software_releases(version);
CREATE INDEX idx_software_releases_active ON software_releases(is_active);

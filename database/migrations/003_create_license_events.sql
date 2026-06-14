-- Migration 003: Create license_events table
-- Audit log of all license-related events

CREATE TABLE license_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    hwid TEXT,
    user_agent TEXT,
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_license_events_license ON license_events(license_id);
CREATE INDEX idx_license_events_type ON license_events(event_type);
CREATE INDEX idx_license_events_created ON license_events(created_at);

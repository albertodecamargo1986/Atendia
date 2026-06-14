-- Migration 002: Create licenses table
-- Stores license records linked to customers

CREATE TABLE licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    serial VARCHAR(25) NOT NULL UNIQUE,
    plan VARCHAR(20) NOT NULL CHECK (plan IN ('monthly', 'quarterly', 'semiannual', 'annual')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended', 'blocked')),
    hwid TEXT,
    activation_count INTEGER NOT NULL DEFAULT 0,
    transfer_count INTEGER NOT NULL DEFAULT 0,
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    last_validation TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_licenses_serial ON licenses(serial);
CREATE INDEX idx_licenses_customer ON licenses(customer_id);
CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_licenses_expires ON licenses(expires_at);
CREATE INDEX idx_licenses_hwid ON licenses(hwid);

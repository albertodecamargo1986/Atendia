-- Migration 004: Create security_alerts table
-- Stores security incidents and suspicious activity reports

CREATE TABLE security_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    raw_data JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_alerts_license ON security_alerts(license_id);
CREATE INDEX idx_security_alerts_severity ON security_alerts(severity);
CREATE INDEX idx_security_alerts_resolved ON security_alerts(resolved);
CREATE INDEX idx_security_alerts_created ON security_alerts(created_at);

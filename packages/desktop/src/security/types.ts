// =============================================================================
// AtendIA Desktop — Security Module Shared Types
// =============================================================================

export interface SecurityEvent {
  type:
    | 'integrity_violation'
    | 'firewall_block'
    | 'hosts_redirect'
    | 'proxy_intercept'
    | 'clock_manipulation'
    | 'suspicious_process';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: string;
  details: Record<string, any>;
}

export interface LicenseInfo {
  serial: string;
  hwid: string;
  plan: string;
  expiresAt: string;
  isValid: boolean;
}

export interface OnlineValidationResult {
  valid: boolean;
  plan: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'revoked' | 'suspended';
}

export interface EnforcementResult {
  accessLevel: 'full' | 'readonly' | 'blocked';
  licenseInfo: LicenseInfo | null;
  clockManipulation: boolean;
  requiresOnlineValidation: boolean;
}

export interface IntegrityCheckResult {
  intact: boolean;
  modified: string[];
  missing: string[];
}

export interface SecurityCheckResult {
  integrity: IntegrityCheckResult;
  networkEvents: SecurityEvent[];
  license: EnforcementResult;
  hwid: string;
}

export interface SecurityConfig {
  appPath: string;
  publicKeyPath: string;
  appDataPath: string;
  licenseServerDomain?: string;
  integrityCheckIntervalMs?: number;
  networkCheckIntervalMs?: number;
  reportIntervalMs?: number;
  onLicenseStatusChange?: (accessLevel: 'full' | 'readonly' | 'blocked') => void;
  onIntegrityViolation?: (result: IntegrityCheckResult) => void;
}

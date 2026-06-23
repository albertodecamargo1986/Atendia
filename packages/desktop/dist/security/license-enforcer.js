"use strict";
// =============================================================================
// AtendIA Desktop — License Enforcer
// Multi-layer license verification: local JWT, online validation, clock
// manipulation detection, and graduated enforcement (full -> readonly -> blocked)
// =============================================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseEnforcer = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const child_process_1 = require("child_process");
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const CACHE_FOLDER = 'SysCache';
const VALIDATION_FILE = 'license.dat';
// NTP servers for clock comparison
const NTP_SERVERS = ['pool.ntp.org', 'time.google.com', 'time.windows.com', 'time.cloudflare.com'];
class LicenseEnforcer {
    localToken = null;
    publicKey;
    lastOnlineValidation = null;
    offlineToleranceDays = 7;
    readonlyMode = false;
    completelyBlocked = false;
    appDataPath;
    validationFilePath;
    encryptionKey;
    onLicenseStatusChange;
    constructor(publicKeyPath, callback) {
        this.appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
        const cacheDir = path.join(this.appDataPath, CACHE_FOLDER);
        this.validationFilePath = path.join(cacheDir, VALIDATION_FILE);
        this.onLicenseStatusChange = callback;
        const machineId = `${process.env.COMPUTERNAME || 'unknown'}-${process.env.USERNAME || 'unknown'}`;
        this.encryptionKey = crypto.createHash('sha256').update(`atendia-lic-${machineId}`).digest();
        // Load embedded RSA public key
        try {
            if (fs.existsSync(publicKeyPath)) {
                this.publicKey = fs.readFileSync(publicKeyPath, 'utf8');
            }
            else {
                // Fallback: hardcoded public key (replace with actual key in production)
                this.publicKey = '';
                console.warn('[LicenseEnforcer] Public key file not found at:', publicKeyPath);
            }
        }
        catch (error) {
            this.publicKey = '';
            console.error('[LicenseEnforcer] Failed to load public key:', error);
        }
    }
    // =========================================================================
    // Layer 1 — Local JWT Verification
    // =========================================================================
    /**
     * Verify a local JWT token using the embedded RSA public key.
     * Returns LicenseInfo if valid, null otherwise.
     */
    verifyLocalToken(token) {
        try {
            if (!this.publicKey) {
                console.error('[LicenseEnforcer] No public key available for verification');
                return null;
            }
            // Split JWT into parts
            const parts = token.split('.');
            if (parts.length !== 3) {
                return null;
            }
            const [headerB64, payloadB64, signatureB64] = parts;
            // Verify signature using RSA-SHA256
            const verifier = crypto.createVerify('RSA-SHA256');
            verifier.update(`${headerB64}.${payloadB64}`);
            const signature = Buffer.from(signatureB64, 'base64url');
            const isValid = verifier.verify(this.publicKey, signature);
            if (!isValid) {
                console.warn('[LicenseEnforcer] JWT signature verification failed');
                return null;
            }
            // Decode payload
            const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
            // Check expiration
            if (payload.exp && payload.exp * 1000 < Date.now()) {
                console.warn('[LicenseEnforcer] JWT token expired');
                return null;
            }
            return {
                serial: payload.serial || '',
                hwid: payload.hwid || '',
                plan: payload.plan || 'free',
                expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : '',
                isValid: true,
            };
        }
        catch (error) {
            console.error('[LicenseEnforcer] Local token verification failed:', error);
            return null;
        }
    }
    // =========================================================================
    // Layer 2 — Online Validation
    // =========================================================================
    /**
     * Perform online license validation by calling the license server.
     */
    async performOnlineValidation(serial, hwid) {
        return new Promise((resolve) => {
            try {
                const postData = JSON.stringify({ serial, hwid, timestamp: new Date().toISOString() });
                const requestOptions = {
                    hostname: 'api.atend-ia.com',
                    port: 443,
                    path: '/api/license/validate',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData),
                    },
                    timeout: 15000,
                };
                const req = https.request(requestOptions, (res) => {
                    let body = '';
                    res.on('data', (chunk) => {
                        body += chunk.toString();
                    });
                    res.on('end', () => {
                        try {
                            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                                const result = JSON.parse(body);
                                this.lastOnlineValidation = new Date();
                                this.saveLastValidationTimestamp().catch(() => { });
                                resolve({
                                    valid: result.valid ?? false,
                                    plan: result.plan ?? 'free',
                                    expiresAt: result.expiresAt ?? '',
                                    status: result.status ?? 'revoked',
                                });
                            }
                            else {
                                resolve({
                                    valid: false,
                                    plan: 'free',
                                    expiresAt: '',
                                    status: 'revoked',
                                });
                            }
                        }
                        catch {
                            resolve({
                                valid: false,
                                plan: 'free',
                                expiresAt: '',
                                status: 'revoked',
                            });
                        }
                    });
                });
                req.on('error', () => {
                    resolve({
                        valid: false,
                        plan: 'free',
                        expiresAt: '',
                        status: 'revoked',
                    });
                });
                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        valid: false,
                        plan: 'free',
                        expiresAt: '',
                        status: 'revoked',
                    });
                });
                req.write(postData);
                req.end();
            }
            catch (error) {
                console.error('[LicenseEnforcer] Online validation failed:', error);
                resolve({
                    valid: false,
                    plan: 'free',
                    expiresAt: '',
                    status: 'revoked',
                });
            }
        });
    }
    // =========================================================================
    // Layer 3 — Access Level Determination
    // =========================================================================
    /**
     * Get current access level based on license status.
     */
    getAccessLevel() {
        if (this.completelyBlocked)
            return 'blocked';
        if (this.readonlyMode)
            return 'readonly';
        return 'full';
    }
    // =========================================================================
    // Clock Manipulation Detection
    // =========================================================================
    /**
     * Detect clock manipulation by comparing local time with server/NTP time.
     * If difference > 48 hours, treats as fraud attempt.
     */
    async detectClockManipulation() {
        const localTime = new Date();
        try {
            // Try to get server time from license server
            const serverTime = await this.getServerTime();
            if (serverTime) {
                const diffMs = Math.abs(localTime.getTime() - serverTime.getTime());
                const diffHours = diffMs / (1000 * 60 * 60);
                if (diffHours > 48) {
                    return {
                        manipulated: true,
                        localTime,
                        serverTime,
                        differenceHours: diffHours,
                    };
                }
                return {
                    manipulated: false,
                    localTime,
                    serverTime,
                    differenceHours: diffHours,
                };
            }
        }
        catch (error) {
            console.error('[LicenseEnforcer] Clock manipulation check failed:', error);
        }
        // Fallback: try NTP
        try {
            const ntpTime = await this.getNTPTime();
            const diffMs = Math.abs(localTime.getTime() - ntpTime.getTime());
            const diffHours = diffMs / (1000 * 60 * 60);
            if (diffHours > 48) {
                return {
                    manipulated: true,
                    localTime,
                    serverTime: ntpTime,
                    differenceHours: diffHours,
                };
            }
            return {
                manipulated: false,
                localTime,
                serverTime: ntpTime,
                differenceHours: diffHours,
            };
        }
        catch {
            // Cannot determine — assume not manipulated but flag
            return {
                manipulated: false,
                localTime,
                serverTime: localTime, // No reference available
                differenceHours: 0,
            };
        }
    }
    // =========================================================================
    // Main Enforcement
    // =========================================================================
    /**
     * Run full license enforcement check.
     * Called on startup and periodically.
     */
    async enforce(serial, hwid) {
        try {
            // Step 1: Check for clock manipulation
            const clockCheck = await this.detectClockManipulation();
            if (clockCheck.manipulated) {
                this.readonlyMode = true;
                this.completelyBlocked = false;
                this.notifyStatusChange('readonly');
                return {
                    accessLevel: 'readonly',
                    licenseInfo: null,
                    clockManipulation: true,
                    requiresOnlineValidation: true,
                };
            }
            // Step 2: Try online validation
            const onlineResult = await this.performOnlineValidation(serial, hwid);
            if (onlineResult.valid && onlineResult.status === 'active') {
                this.readonlyMode = false;
                this.completelyBlocked = false;
                this.notifyStatusChange('full');
                return {
                    accessLevel: 'full',
                    licenseInfo: {
                        serial,
                        hwid,
                        plan: onlineResult.plan,
                        expiresAt: onlineResult.expiresAt,
                        isValid: true,
                    },
                    clockManipulation: false,
                    requiresOnlineValidation: false,
                };
            }
            // Step 3: License is not active — check offline tolerance
            if (onlineResult.status === 'revoked') {
                // Revoked licenses get no tolerance
                this.completelyBlocked = true;
                this.readonlyMode = false;
                this.notifyStatusChange('blocked');
                return {
                    accessLevel: 'blocked',
                    licenseInfo: {
                        serial,
                        hwid,
                        plan: onlineResult.plan,
                        expiresAt: onlineResult.expiresAt,
                        isValid: false,
                    },
                    clockManipulation: false,
                    requiresOnlineValidation: false,
                };
            }
            // Step 4: Expired or suspended — check when last online validation succeeded
            const lastValidation = await this.loadLastValidationTimestamp();
            if (lastValidation) {
                const daysSinceLastValidation = (Date.now() - lastValidation.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceLastValidation <= this.offlineToleranceDays) {
                    // Within offline tolerance — readonly mode
                    if (!this.readonlyMode) {
                        this.readonlyMode = true;
                        this.notifyStatusChange('readonly');
                    }
                    return {
                        accessLevel: 'readonly',
                        licenseInfo: {
                            serial,
                            hwid,
                            plan: onlineResult.plan,
                            expiresAt: onlineResult.expiresAt,
                            isValid: false,
                        },
                        clockManipulation: false,
                        requiresOnlineValidation: false,
                    };
                }
            }
            // Step 5: Exceeded offline tolerance or never validated online
            this.completelyBlocked = true;
            this.readonlyMode = false;
            this.notifyStatusChange('blocked');
            return {
                accessLevel: 'blocked',
                licenseInfo: {
                    serial,
                    hwid,
                    plan: onlineResult.plan,
                    expiresAt: onlineResult.expiresAt,
                    isValid: false,
                },
                clockManipulation: false,
                requiresOnlineValidation: true,
            };
        }
        catch (error) {
            console.error('[LicenseEnforcer] Enforcement check failed:', error);
            // Degrade gracefully — if enforcement fails, allow readonly
            if (!this.completelyBlocked) {
                this.readonlyMode = true;
                this.notifyStatusChange('readonly');
            }
            return {
                accessLevel: this.getAccessLevel(),
                licenseInfo: null,
                clockManipulation: false,
                requiresOnlineValidation: true,
            };
        }
    }
    /**
     * Set the local JWT token for local verification.
     */
    setLocalToken(token) {
        this.localToken = token;
    }
    /**
     * Set the callback for license status changes.
     */
    setStatusChangeCallback(callback) {
        this.onLicenseStatusChange = callback;
    }
    // =========================================================================
    // Private Helpers
    // =========================================================================
    notifyStatusChange(accessLevel) {
        try {
            this.onLicenseStatusChange?.(accessLevel);
        }
        catch (error) {
            console.error('[LicenseEnforcer] Status change callback failed:', error);
        }
    }
    /**
     * Get server time from the license server.
     */
    getServerTime() {
        return new Promise((resolve) => {
            try {
                const requestOptions = {
                    hostname: 'api.atend-ia.com',
                    port: 443,
                    path: '/api/time',
                    method: 'GET',
                    timeout: 5000,
                };
                const req = https.request(requestOptions, (res) => {
                    let body = '';
                    res.on('data', (chunk) => {
                        body += chunk.toString();
                    });
                    res.on('end', () => {
                        try {
                            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                                const result = JSON.parse(body);
                                resolve(new Date(result.serverTime));
                            }
                            else {
                                resolve(null);
                            }
                        }
                        catch {
                            resolve(null);
                        }
                    });
                });
                req.on('error', () => resolve(null));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(null);
                });
                req.end();
            }
            catch {
                resolve(null);
            }
        });
    }
    /**
     * Get approximate NTP time by querying public NTP servers.
     * Uses a simple offset calculation approach suitable for Electron apps.
     */
    async getNTPTime() {
        for (const server of NTP_SERVERS) {
            try {
                const time = await this.queryNTPServer(server);
                if (time)
                    return time;
            }
            catch {
                continue;
            }
        }
        // If all NTP servers fail, fall back to HTTP date headers
        return await this.getHTTPTime() ?? new Date();
    }
    /**
     * Query a single NTP server using a simple UDP-like approach via PowerShell.
     * Since Node.js doesn't have built-in NTP, we use a PowerShell helper.
     */
    queryNTPServer(server) {
        return new Promise((resolve) => {
            try {
                // Use PowerShell to get NTP offset
                const psCommand = `
          try {
            $ntps = [System.Net.Dns]::GetHostAddresses('${server}')[0].IPAddressToString
            $w32tm = w32tm /stripchart /computer:$ntps /samples:1 /dataonly 2>$null
            if ($w32tm -match 'd:\\s*([+-]?[\\d.]+)s') {
              $offset = [double]$matches[1]
              (Get-Date).AddSeconds($offset) | ConvertTo-Json
            } else {
              $null
            }
          } catch { $null }
        `.trim();
                (0, child_process_1.exec)(psCommand, { windowsHide: true, timeout: 8000, shell: 'powershell.exe' }, (error, stdout) => {
                    if (error || !stdout.trim()) {
                        resolve(null);
                        return;
                    }
                    try {
                        const result = JSON.parse(stdout.trim());
                        resolve(new Date(result));
                    }
                    catch {
                        resolve(null);
                    }
                });
            }
            catch {
                resolve(null);
            }
        });
    }
    /**
     * Fallback: get current time from HTTP Date header.
     */
    getHTTPTime() {
        return new Promise((resolve) => {
            try {
                const requestOptions = {
                    hostname: 'www.google.com',
                    port: 443,
                    path: '/',
                    method: 'HEAD',
                    timeout: 5000,
                };
                const req = https.request(requestOptions, (res) => {
                    const dateHeader = res.headers.date;
                    if (dateHeader) {
                        resolve(new Date(dateHeader));
                    }
                    else {
                        resolve(null);
                    }
                });
                req.on('error', () => resolve(null));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(null);
                });
                req.end();
            }
            catch {
                resolve(null);
            }
        });
    }
    // =========================================================================
    // Encrypted Validation State Persistence
    // =========================================================================
    encrypt(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }
    decrypt(encryptedData) {
        try {
            const [ivHex, encrypted] = encryptedData.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch {
            return '';
        }
    }
    async saveLastValidationTimestamp() {
        try {
            const cacheDir = path.dirname(this.validationFilePath);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            const data = JSON.stringify({
                lastOnlineValidation: new Date().toISOString(),
                readonlySince: this.readonlyMode ? new Date().toISOString() : null,
            });
            const encrypted = this.encrypt(data);
            fs.writeFileSync(this.validationFilePath, encrypted, 'utf8');
        }
        catch (error) {
            console.error('[LicenseEnforcer] Failed to save validation state:', error);
        }
    }
    async loadLastValidationTimestamp() {
        try {
            if (!fs.existsSync(this.validationFilePath))
                return null;
            const encrypted = fs.readFileSync(this.validationFilePath, 'utf8');
            const decrypted = this.decrypt(encrypted);
            if (!decrypted)
                return null;
            const parsed = JSON.parse(decrypted);
            if (parsed.lastOnlineValidation) {
                return new Date(parsed.lastOnlineValidation);
            }
            return null;
        }
        catch (error) {
            console.error('[LicenseEnforcer] Failed to load validation state:', error);
            return null;
        }
    }
}
exports.LicenseEnforcer = LicenseEnforcer;
//# sourceMappingURL=license-enforcer.js.map
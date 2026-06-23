"use strict";
// =============================================================================
// AtendIA Desktop — File Integrity Monitor
// Monitors critical application files for tampering using SHA-256 hashes.
// Baseline is stored encrypted in %APPDATA%\SysCache\
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
exports.IntegrityMonitor = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const BASELINE_FOLDER = 'SysCache';
const BASELINE_FILE = 'signature.dat';
const INTEGRITY_CHECK_INTERVAL_DEFAULT = 6 * 60 * 60 * 1000; // 6 hours
class IntegrityMonitor {
    fileHashes = new Map();
    criticalFiles;
    monitoringInterval = null;
    appDataPath;
    baselineFilePath;
    encryptionKey;
    appPath;
    constructor(appPath) {
        this.appPath = appPath;
        this.appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
        const cacheDir = path.join(this.appDataPath, BASELINE_FOLDER);
        this.baselineFilePath = path.join(cacheDir, BASELINE_FILE);
        // Derive encryption key from machine ID (hostname + username)
        const machineId = `${process.env.COMPUTERNAME || 'unknown'}-${process.env.USERNAME || 'unknown'}`;
        this.encryptionKey = crypto.createHash('sha256').update(`atendia-hwid-${machineId}`).digest();
        // Critical files relative to appPath
        this.criticalFiles = [
            'main.js',
            'preload.js',
            path.join('security', 'integrity-monitor.ts'),
            path.join('security', 'network-monitor.ts'),
            path.join('security', 'stealth-reporter.ts'),
            path.join('security', 'license-enforcer.ts'),
            path.join('security', 'hwid-generator.ts'),
            path.join('security', 'index.ts'),
            path.join('security', 'types.ts'),
            'license.key',
            'public.key',
            'package.json',
        ];
    }
    /**
     * Calculate SHA-256 hash of a file.
     */
    async calculateFileHash(filePath) {
        return new Promise((resolve) => {
            try {
                const hash = crypto.createHash('sha256');
                const stream = fs.createReadStream(filePath);
                stream.on('data', (data) => hash.update(data));
                stream.on('end', () => resolve(hash.digest('hex')));
                stream.on('error', () => resolve(''));
            }
            catch {
                resolve('');
            }
        });
    }
    /**
     * Scan all critical files and store baseline hashes.
     * Run on first install only.
     */
    async initializeBaseline() {
        try {
            this.fileHashes.clear();
            for (const relativePath of this.criticalFiles) {
                const fullPath = path.join(this.appPath, relativePath);
                try {
                    const hash = await this.calculateFileHash(fullPath);
                    if (hash) {
                        this.fileHashes.set(relativePath, hash);
                    }
                }
                catch {
                    // File may not exist yet — skip silently
                }
            }
            await this.saveBaseline();
        }
        catch (error) {
            console.error('[IntegrityMonitor] Failed to initialize baseline:', error);
        }
    }
    /**
     * Verify all critical files against stored hashes.
     * Run on every startup.
     */
    async verifyIntegrity() {
        const result = {
            intact: true,
            modified: [],
            missing: [],
        };
        try {
            await this.loadBaseline();
            for (const [relativePath, expectedHash] of this.fileHashes.entries()) {
                const fullPath = path.join(this.appPath, relativePath);
                try {
                    const exists = fs.existsSync(fullPath);
                    if (!exists) {
                        result.missing.push(relativePath);
                        result.intact = false;
                        continue;
                    }
                    const currentHash = await this.calculateFileHash(fullPath);
                    if (currentHash !== expectedHash) {
                        result.modified.push(relativePath);
                        result.intact = false;
                    }
                }
                catch {
                    result.missing.push(relativePath);
                    result.intact = false;
                }
            }
        }
        catch (error) {
            console.error('[IntegrityMonitor] Failed to verify integrity:', error);
            result.intact = false;
        }
        return result;
    }
    /**
     * Initialize baseline and start periodic integrity checks.
     */
    startMonitoring(intervalMs = INTEGRITY_CHECK_INTERVAL_DEFAULT) {
        if (this.monitoringInterval)
            return;
        // Run first verification immediately
        this.verifyIntegrity().catch(() => { });
        this.monitoringInterval = setInterval(() => {
            this.verifyIntegrity().catch(() => { });
        }, intervalMs);
    }
    /**
     * Stop periodic integrity monitoring.
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }
    // ---------------------------------------------------------------------------
    // Private — encrypted baseline persistence
    // ---------------------------------------------------------------------------
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
    async saveBaseline() {
        try {
            const cacheDir = path.dirname(this.baselineFilePath);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            const data = JSON.stringify(Object.fromEntries(this.fileHashes.entries()));
            const encrypted = this.encrypt(data);
            fs.writeFileSync(this.baselineFilePath, encrypted, 'utf8');
        }
        catch (error) {
            console.error('[IntegrityMonitor] Failed to save baseline:', error);
        }
    }
    async loadBaseline() {
        try {
            if (!fs.existsSync(this.baselineFilePath)) {
                await this.initializeBaseline();
                return;
            }
            const encrypted = fs.readFileSync(this.baselineFilePath, 'utf8');
            const decrypted = this.decrypt(encrypted);
            if (!decrypted) {
                throw new Error('Failed to decrypt baseline — possible tampering');
            }
            const parsed = JSON.parse(decrypted);
            this.fileHashes = new Map(Object.entries(parsed));
        }
        catch (error) {
            console.error('[IntegrityMonitor] Failed to load baseline, reinitializing:', error);
            await this.initializeBaseline();
        }
    }
}
exports.IntegrityMonitor = IntegrityMonitor;
//# sourceMappingURL=integrity-monitor.js.map
"use strict";
// =============================================================================
// AtendIA Desktop — Stealth Security Event Reporter
// Maintains an encrypted local queue of security events and sends them to
// the server through multiple fallback endpoints with a generic User-Agent.
// Queue stored in %APPDATA%\SysCache\cache.dat
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
exports.StealthReporter = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const CACHE_FOLDER = 'SysCache';
const QUEUE_FILE = 'cache.dat';
const SEND_INTERVAL_DEFAULT = 30 * 60 * 1000; // 30 minutes
// Fallback endpoints — primary, secondary, tertiary
const FALLBACK_ENDPOINTS = [
    { host: 'api.atend-ia.com', port: 443, path: '/api/security/report', protocol: 'https' },
    { host: '45.77.100.XXX', port: 443, path: '/api/security/report', protocol: 'https' }, // placeholder IP
    { host: '185.22.174.XXX', port: 443, path: '/api/security/report', protocol: 'https' }, // placeholder IP
];
// Generic browser-like User-Agent to avoid fingerprinting the reporter
const GENERIC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
class StealthReporter {
    eventQueue = [];
    queueFilePath;
    encryptionKey;
    fallbackEndpoints = FALLBACK_ENDPOINTS;
    sendInterval = null;
    lastSendAttempt = null;
    sendLog = [];
    constructor(appDataPath) {
        const cacheDir = path.join(appDataPath, CACHE_FOLDER);
        this.queueFilePath = path.join(cacheDir, QUEUE_FILE);
        // Derive encryption key from machine identity
        const machineId = `${process.env.COMPUTERNAME || 'unknown'}-${process.env.USERNAME || 'unknown'}`;
        this.encryptionKey = crypto.createHash('sha256').update(`atendia-rpt-${machineId}`).digest();
    }
    /**
     * Add a security event to the encrypted local queue.
     */
    async enqueueEvent(event) {
        try {
            this.eventQueue.push(event);
            await this.saveQueue();
        }
        catch (error) {
            console.error('[StealthReporter] Failed to enqueue event:', error);
        }
    }
    /**
     * Try to send the entire event queue to the server.
     * Returns true if at least one endpoint accepted the data.
     */
    async flushQueue() {
        if (this.eventQueue.length === 0)
            return true;
        try {
            const eventsToSend = [...this.eventQueue];
            const success = await this.attemptSend(eventsToSend);
            this.lastSendAttempt = new Date();
            this.sendLog.push({
                timestamp: this.lastSendAttempt.toISOString(),
                success,
                endpoint: success ? 'primary' : 'all-failed',
            });
            if (success) {
                // Clear queue on successful send
                this.eventQueue = [];
                await this.saveQueue();
            }
            return success;
        }
        catch (error) {
            this.lastSendAttempt = new Date();
            this.sendLog.push({
                timestamp: this.lastSendAttempt.toISOString(),
                success: false,
                endpoint: 'all-failed',
                error: String(error),
            });
            return false;
        }
    }
    /**
     * Attempt to send events through fallback endpoints.
     * Tries each endpoint in order until one succeeds.
     */
    attemptSend(events) {
        return new Promise((resolve) => {
            if (events.length === 0) {
                resolve(true);
                return;
            }
            // Encrypt the payload before transmission
            const payload = this.encrypt(JSON.stringify(events));
            let endpointIndex = 0;
            const tryNextEndpoint = () => {
                if (endpointIndex >= this.fallbackEndpoints.length) {
                    // All endpoints failed
                    resolve(false);
                    return;
                }
                const endpoint = this.fallbackEndpoints[endpointIndex];
                endpointIndex++;
                const postData = JSON.stringify({
                    data: payload,
                    timestamp: new Date().toISOString(),
                });
                const requestOptions = {
                    hostname: endpoint.host,
                    port: endpoint.port,
                    path: endpoint.path,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData),
                        'User-Agent': GENERIC_USER_AGENT,
                    },
                    timeout: 10000, // 10 second timeout per attempt
                };
                const transport = endpoint.protocol === 'https' ? https : http;
                const req = transport.request(requestOptions, (res) => {
                    let body = '';
                    res.on('data', (chunk) => {
                        body += chunk.toString();
                    });
                    res.on('end', () => {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            // Success — send any remaining send-log metadata
                            resolve(true);
                        }
                        else {
                            // Try next endpoint
                            tryNextEndpoint();
                        }
                    });
                });
                req.on('error', () => {
                    // Network error — try next endpoint
                    tryNextEndpoint();
                });
                req.on('timeout', () => {
                    req.destroy();
                    tryNextEndpoint();
                });
                req.write(postData);
                req.end();
            };
            tryNextEndpoint();
        });
    }
    /**
     * Encrypt data with AES-256-CBC using a random IV per call.
     */
    encrypt(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }
    /**
     * Decrypt AES-256-CBC encrypted data.
     */
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
    /**
     * Load the event queue from the encrypted disk file.
     */
    async loadQueue() {
        try {
            if (!fs.existsSync(this.queueFilePath)) {
                this.eventQueue = [];
                return;
            }
            const encrypted = fs.readFileSync(this.queueFilePath, 'utf8');
            if (!encrypted.trim()) {
                this.eventQueue = [];
                return;
            }
            // The queue file stores one encrypted entry per line
            const lines = encrypted.split('\n').filter((l) => l.trim().length > 0);
            const events = [];
            for (const line of lines) {
                const decrypted = this.decrypt(line.trim());
                if (decrypted) {
                    try {
                        const parsed = JSON.parse(decrypted);
                        if (Array.isArray(parsed)) {
                            events.push(...parsed);
                        }
                        else {
                            events.push(parsed);
                        }
                    }
                    catch {
                        // Skip malformed entries
                    }
                }
            }
            this.eventQueue = events;
        }
        catch (error) {
            console.error('[StealthReporter] Failed to load queue:', error);
            this.eventQueue = [];
        }
    }
    /**
     * Save the event queue to the encrypted disk file.
     */
    async saveQueue() {
        try {
            const cacheDir = path.dirname(this.queueFilePath);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            // Encrypt the entire queue as a single block
            const data = JSON.stringify(this.eventQueue);
            const encrypted = this.encrypt(data);
            fs.writeFileSync(this.queueFilePath, encrypted, 'utf8');
        }
        catch (error) {
            console.error('[StealthReporter] Failed to save queue:', error);
        }
    }
    /**
     * Start periodic send attempts.
     */
    startReporting(intervalMs = SEND_INTERVAL_DEFAULT) {
        if (this.sendInterval)
            return;
        // Load queue from disk first
        this.loadQueue().catch(() => { });
        // Initial flush attempt
        this.flushQueue().catch(() => { });
        this.sendInterval = setInterval(() => {
            this.flushQueue().catch(() => { });
        }, intervalMs);
    }
    /**
     * Stop periodic reporting.
     */
    stopReporting() {
        if (this.sendInterval) {
            clearInterval(this.sendInterval);
            this.sendInterval = null;
        }
    }
    /**
     * Get the number of events currently in the queue.
     */
    getQueueSize() {
        return this.eventQueue.length;
    }
    /**
     * Get the send attempt log (for diagnostics).
     */
    getSendLog() {
        return [...this.sendLog];
    }
}
exports.StealthReporter = StealthReporter;
//# sourceMappingURL=stealth-reporter.js.map
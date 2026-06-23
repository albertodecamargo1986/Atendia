"use strict";
// =============================================================================
// AtendIA Desktop — Network Security Monitor
// Detects firewall blocks, hosts file redirects, proxy interception, and
// suspicious MITM processes.
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
exports.NetworkMonitor = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const NETWORK_CHECK_INTERVAL_DEFAULT = 30 * 60 * 1000; // 30 minutes
const LOG_FOLDER = 'SysCache';
const LOG_FILE = 'netlog.dat';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
// Known MITM proxy processes
const MITM_PROCESSES = [
    'mitmproxy', 'mitmweb', 'mitmdump',
    'charles', 'charles-proxy',
    'fiddler', 'fiddler.exe',
    'burpsuite', 'burp',
    'owasp-zap', 'zap',
    'proxyman', 'whistle',
    'wireshark',
];
class NetworkMonitor {
    licenseServerDomain = 'api.atend-ia.com';
    monitoringInterval = null;
    eventQueue = [];
    appDataPath;
    logFilePath;
    encryptionKey;
    appExecutableName;
    constructor() {
        this.appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
        const cacheDir = path.join(this.appDataPath, LOG_FOLDER);
        this.logFilePath = path.join(cacheDir, LOG_FILE);
        const machineId = `${process.env.COMPUTERNAME || 'unknown'}-${process.env.USERNAME || 'unknown'}`;
        this.encryptionKey = crypto.createHash('sha256').update(`atendia-net-${machineId}`).digest();
        // Determine the app executable name for firewall rule matching
        this.appExecutableName = path.basename(process.execPath || 'atendia.exe').toLowerCase();
    }
    /**
     * Check if the app is blocked by Windows Firewall outbound rules.
     * Parses output of `netsh advfirewall firewall show rule name=all dir=out`
     */
    async checkFirewallRules() {
        try {
            const output = await this.execPowerShell('netsh advfirewall firewall show rule name=all dir=out');
            // Look for rules that block our app executable
            const lines = output.split('\n');
            let currentRule = {};
            let isBlocked = false;
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed === '--------------------------------------------------------------------------') {
                    // End of a rule block — evaluate it
                    if (currentRule['Action'] && currentRule['Action'].toLowerCase() === 'block') {
                        const program = currentRule['Program'] || '';
                        const ruleName = currentRule['Rule Name'] || '';
                        if (program.toLowerCase().includes(this.appExecutableName) ||
                            ruleName.toLowerCase().includes('atendia')) {
                            isBlocked = true;
                            this.enqueueEvent({
                                type: 'firewall_block',
                                severity: 'high',
                                description: `Firewall outbound block rule detected: "${ruleName}"`,
                                timestamp: new Date().toISOString(),
                                details: { rule: currentRule },
                            });
                        }
                    }
                    currentRule = {};
                    continue;
                }
                // Parse "Key: Value" lines from netsh output
                const colonIndex = trimmed.indexOf(':');
                if (colonIndex > 0) {
                    const key = trimmed.substring(0, colonIndex).trim();
                    const value = trimmed.substring(colonIndex + 1).trim();
                    currentRule[key] = value;
                }
            }
            return isBlocked;
        }
        catch (error) {
            console.error('[NetworkMonitor] Firewall check failed:', error);
            return false;
        }
    }
    /**
     * Check if the license server domain or known IPs are redirected in the hosts file.
     */
    async checkHostsFile() {
        try {
            const hostsPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts');
            if (!fs.existsSync(hostsPath))
                return false;
            const content = fs.readFileSync(hostsPath, 'utf8').toLowerCase();
            const suspiciousEntries = [];
            // Check for our domain
            if (content.includes(this.licenseServerDomain.toLowerCase())) {
                suspiciousEntries.push(`Domain ${this.licenseServerDomain} found in hosts file`);
            }
            // Check for known license server IPs being redirected
            const knownIPs = ['45.77.100.', '185.22.174.'];
            for (const ip of knownIPs) {
                if (content.includes(ip)) {
                    suspiciousEntries.push(`Known server IP ${ip}* found in hosts file`);
                }
            }
            if (suspiciousEntries.length > 0) {
                this.enqueueEvent({
                    type: 'hosts_redirect',
                    severity: 'critical',
                    description: `Hosts file redirect detected: ${suspiciousEntries.join('; ')}`,
                    timestamp: new Date().toISOString(),
                    details: { suspiciousEntries },
                });
                return true;
            }
            return false;
        }
        catch (error) {
            console.error('[NetworkMonitor] Hosts file check failed:', error);
            return false;
        }
    }
    /**
     * Check for proxy interception via registry and known MITM processes.
     */
    async checkProxyInterception() {
        let intercepted = false;
        try {
            // Check system proxy settings via registry
            const proxyEnabled = await this.checkSystemProxy();
            if (proxyEnabled) {
                this.enqueueEvent({
                    type: 'proxy_intercept',
                    severity: 'medium',
                    description: 'System proxy is enabled — potential traffic interception',
                    timestamp: new Date().toISOString(),
                    details: { proxyEnabled: true },
                });
                intercepted = true;
            }
        }
        catch (error) {
            console.error('[NetworkMonitor] System proxy check failed:', error);
        }
        try {
            // Check for known MITM processes
            const mitmDetected = await this.checkMITMProcesses();
            if (mitmDetected.length > 0) {
                this.enqueueEvent({
                    type: 'proxy_intercept',
                    severity: 'critical',
                    description: `MITM proxy process detected: ${mitmDetected.join(', ')}`,
                    timestamp: new Date().toISOString(),
                    details: { processes: mitmDetected },
                });
                intercepted = true;
            }
        }
        catch (error) {
            console.error('[NetworkMonitor] MITM process check failed:', error);
        }
        return intercepted;
    }
    /**
     * Run all network security checks and return collected events.
     */
    async runAllChecks() {
        const eventsBefore = this.eventQueue.length;
        try {
            await Promise.all([
                this.checkFirewallRules(),
                this.checkHostsFile(),
                this.checkProxyInterception(),
            ]);
        }
        catch (error) {
            console.error('[NetworkMonitor] Security sweep failed:', error);
        }
        // Return only the new events
        const newEvents = this.eventQueue.slice(eventsBefore);
        return newEvents;
    }
    /**
     * Start periodic network monitoring.
     */
    startMonitoring(intervalMs = NETWORK_CHECK_INTERVAL_DEFAULT) {
        if (this.monitoringInterval)
            return;
        // Run initial check
        this.runAllChecks().catch(() => { });
        this.monitoringInterval = setInterval(() => {
            this.runAllChecks().catch(() => { });
        }, intervalMs);
    }
    /**
     * Stop periodic network monitoring.
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    enqueueEvent(event) {
        this.eventQueue.push(event);
        this.persistEventLog(event).catch(() => { });
    }
    /**
     * Execute a PowerShell/command-line command silently.
     */
    execPowerShell(command) {
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(command, { windowsHide: true, timeout: 15000 }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stdout || '');
            });
        });
    }
    /**
     * Check if system proxy is enabled via Windows registry.
     */
    async checkSystemProxy() {
        try {
            const output = await this.execPowerShell('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable');
            // ProxyEnable = 0x1 means proxy is enabled
            return output.includes('0x1');
        }
        catch {
            return false;
        }
    }
    /**
     * Check for known MITM proxy processes running.
     */
    async checkMITMProcesses() {
        try {
            const output = await this.execPowerShell('Get-Process | Select-Object -ExpandProperty ProcessName');
            const runningProcesses = output
                .split('\n')
                .map((p) => p.trim().toLowerCase())
                .filter((p) => p.length > 0);
            const detected = [];
            for (const mitmProc of MITM_PROCESSES) {
                if (runningProcesses.includes(mitmProc.toLowerCase())) {
                    detected.push(mitmProc);
                }
            }
            return detected;
        }
        catch {
            return [];
        }
    }
    // ---------------------------------------------------------------------------
    // Encrypted event log persistence
    // ---------------------------------------------------------------------------
    encrypt(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }
    async persistEventLog(event) {
        try {
            const cacheDir = path.dirname(this.logFilePath);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            const logEntry = this.encrypt(JSON.stringify(event)) + '\n';
            fs.appendFileSync(this.logFilePath, logEntry, 'utf8');
        }
        catch (error) {
            console.error('[NetworkMonitor] Failed to persist event log:', error);
        }
    }
}
exports.NetworkMonitor = NetworkMonitor;
//# sourceMappingURL=network-monitor.js.map
"use strict";
// =============================================================================
// AtendIA Desktop — Security Orchestrator
// Central coordinator for all security modules. Initializes, runs checks,
// and manages the lifecycle of all security subsystems.
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HWIDGenerator = exports.LicenseEnforcer = exports.StealthReporter = exports.NetworkMonitor = exports.IntegrityMonitor = exports.SecurityOrchestrator = void 0;
const integrity_monitor_1 = require("./integrity-monitor");
const network_monitor_1 = require("./network-monitor");
const stealth_reporter_1 = require("./stealth-reporter");
const license_enforcer_1 = require("./license-enforcer");
const hwid_generator_1 = require("./hwid-generator");
class SecurityOrchestrator {
    integrityMonitor;
    networkMonitor;
    stealthReporter;
    licenseEnforcer;
    hwidGenerator;
    config;
    initialized = false;
    constructor(config) {
        this.config = config;
        const appDataPath = config.appDataPath ||
            process.env.APPDATA ||
            (process.env.USERPROFILE
                ? `${process.env.USERPROFILE}\\AppData\\Roaming`
                : 'C:\\AppData\\Roaming');
        this.integrityMonitor = new integrity_monitor_1.IntegrityMonitor(config.appPath);
        this.networkMonitor = new network_monitor_1.NetworkMonitor();
        this.stealthReporter = new stealth_reporter_1.StealthReporter(appDataPath);
        this.licenseEnforcer = new license_enforcer_1.LicenseEnforcer(config.publicKeyPath, config.onLicenseStatusChange);
        this.hwidGenerator = new hwid_generator_1.HWIDGenerator();
    }
    /**
     * Initialize all security modules.
     * - Load/persist event queues
     * - Initialize integrity baseline if first run
     * - Perform initial checks
     */
    async initialize() {
        if (this.initialized)
            return;
        try {
            // Load the stealth reporter queue from disk
            await this.stealthReporter.loadQueue();
            // Verify file integrity on startup
            const integrityResult = await this.integrityMonitor.verifyIntegrity();
            if (!integrityResult.intact) {
                // Report integrity violation before showing any UI
                const violationDescriptions = [
                    ...integrityResult.modified.map((f) => `Modified: ${f}`),
                    ...integrityResult.missing.map((f) => `Missing: ${f}`),
                ];
                await this.stealthReporter.enqueueEvent({
                    type: 'integrity_violation',
                    severity: 'critical',
                    description: `Application integrity compromised: ${violationDescriptions.join(', ')}`,
                    timestamp: new Date().toISOString(),
                    details: {
                        modified: integrityResult.modified,
                        missing: integrityResult.missing,
                    },
                });
                // Attempt to flush immediately to ensure server receives the report
                await this.stealthReporter.flushQueue();
                // Notify caller
                this.config.onIntegrityViolation?.(integrityResult);
                // Block startup
                console.error('[SecurityOrchestrator] Integrity compromised. ' +
                    'Modified files: ' + integrityResult.modified.join(', ') + ' ' +
                    'Missing files: ' + integrityResult.missing.join(', ') + ' ' +
                    'Contact suporte@atend-ia.com');
            }
            // Run initial network security check
            const networkEvents = await this.networkMonitor.runAllChecks();
            for (const event of networkEvents) {
                await this.stealthReporter.enqueueEvent(event);
            }
            this.initialized = true;
        }
        catch (error) {
            console.error('[SecurityOrchestrator] Initialization failed:', error);
            // Never crash — degrade gracefully
            this.initialized = true;
        }
    }
    /**
     * Run a full security sweep across all modules.
     */
    async runSecurityCheck() {
        const result = {
            integrity: { intact: true, modified: [], missing: [] },
            networkEvents: [],
            license: {
                accessLevel: 'full',
                licenseInfo: null,
                clockManipulation: false,
                requiresOnlineValidation: false,
            },
            hwid: '',
        };
        try {
            // Run all checks in parallel where possible
            const [integrityResult, networkEvents, hwid] = await Promise.all([
                this.integrityMonitor.verifyIntegrity().catch(() => ({
                    intact: false,
                    modified: [],
                    missing: [],
                })),
                this.networkMonitor.runAllChecks().catch(() => []),
                this.hwidGenerator.generate().catch(() => ''),
            ]);
            result.integrity = integrityResult;
            result.networkEvents = networkEvents;
            result.hwid = hwid;
            // Enqueue all detected events for stealth reporting
            if (!integrityResult.intact) {
                await this.stealthReporter.enqueueEvent({
                    type: 'integrity_violation',
                    severity: 'critical',
                    description: 'Integrity check failed during security sweep',
                    timestamp: new Date().toISOString(),
                    details: {
                        modified: integrityResult.modified,
                        missing: integrityResult.missing,
                    },
                });
            }
            for (const event of networkEvents) {
                await this.stealthReporter.enqueueEvent(event);
            }
            // Attempt to flush queued events
            await this.stealthReporter.flushQueue();
        }
        catch (error) {
            console.error('[SecurityOrchestrator] Security check failed:', error);
        }
        return result;
    }
    /**
     * Get the current Hardware ID.
     */
    async getHWID() {
        try {
            return await this.hwidGenerator.generate();
        }
        catch (error) {
            console.error('[SecurityOrchestrator] Failed to get HWID:', error);
            return '';
        }
    }
    /**
     * Get the HWID with component hashes (for fuzzy matching).
     */
    async getHWIDWithComponents() {
        try {
            return await this.hwidGenerator.generateWithComponents();
        }
        catch (error) {
            console.error('[SecurityOrchestrator] Failed to get component HWID:', error);
            return '';
        }
    }
    /**
     * Run license enforcement with the given serial and HWID.
     */
    async enforceLicense(serial, hwid) {
        try {
            return await this.licenseEnforcer.enforce(serial, hwid);
        }
        catch (error) {
            console.error('[SecurityOrchestrator] License enforcement failed:', error);
            return {
                accessLevel: 'readonly',
                licenseInfo: null,
                clockManipulation: false,
                requiresOnlineValidation: true,
            };
        }
    }
    /**
     * Start all background monitoring tasks.
     */
    startAll() {
        try {
            this.integrityMonitor.startMonitoring(this.config.integrityCheckIntervalMs);
            this.networkMonitor.startMonitoring(this.config.networkCheckIntervalMs);
            this.stealthReporter.startReporting(this.config.reportIntervalMs);
        }
        catch (error) {
            console.error('[SecurityOrchestrator] Failed to start monitoring:', error);
        }
    }
    /**
     * Stop all background monitoring tasks.
     */
    stopAll() {
        try {
            this.integrityMonitor.stopMonitoring();
            this.networkMonitor.stopMonitoring();
            this.stealthReporter.stopReporting();
        }
        catch (error) {
            console.error('[SecurityOrchestrator] Failed to stop monitoring:', error);
        }
    }
    /**
     * Get direct access to individual security modules.
     */
    get modules() {
        return {
            integrity: this.integrityMonitor,
            network: this.networkMonitor,
            reporter: this.stealthReporter,
            license: this.licenseEnforcer,
            hwid: this.hwidGenerator,
        };
    }
}
exports.SecurityOrchestrator = SecurityOrchestrator;
// Re-export all modules and types for convenience
var integrity_monitor_2 = require("./integrity-monitor");
Object.defineProperty(exports, "IntegrityMonitor", { enumerable: true, get: function () { return integrity_monitor_2.IntegrityMonitor; } });
var network_monitor_2 = require("./network-monitor");
Object.defineProperty(exports, "NetworkMonitor", { enumerable: true, get: function () { return network_monitor_2.NetworkMonitor; } });
var stealth_reporter_2 = require("./stealth-reporter");
Object.defineProperty(exports, "StealthReporter", { enumerable: true, get: function () { return stealth_reporter_2.StealthReporter; } });
var license_enforcer_2 = require("./license-enforcer");
Object.defineProperty(exports, "LicenseEnforcer", { enumerable: true, get: function () { return license_enforcer_2.LicenseEnforcer; } });
var hwid_generator_2 = require("./hwid-generator");
Object.defineProperty(exports, "HWIDGenerator", { enumerable: true, get: function () { return hwid_generator_2.HWIDGenerator; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map
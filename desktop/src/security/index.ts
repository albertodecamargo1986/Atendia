// =============================================================================
// AtendIA Desktop — Security Orchestrator
// Central coordinator for all security modules. Initializes, runs checks,
// and manages the lifecycle of all security subsystems.
// =============================================================================

import { IntegrityMonitor } from './integrity-monitor';
import { NetworkMonitor } from './network-monitor';
import { StealthReporter } from './stealth-reporter';
import { LicenseEnforcer } from './license-enforcer';
import { HWIDGenerator } from './hwid-generator';
import { SecurityConfig, SecurityCheckResult } from './types';

export class SecurityOrchestrator {
  private integrityMonitor: IntegrityMonitor;
  private networkMonitor: NetworkMonitor;
  private stealthReporter: StealthReporter;
  private licenseEnforcer: LicenseEnforcer;
  private hwidGenerator: HWIDGenerator;
  private config: SecurityConfig;
  private initialized: boolean = false;

  constructor(config: SecurityConfig) {
    this.config = config;

    const appDataPath =
      config.appDataPath ||
      process.env.APPDATA ||
      (process.env.USERPROFILE
        ? `${process.env.USERPROFILE}\\AppData\\Roaming`
        : 'C:\\AppData\\Roaming');

    this.integrityMonitor = new IntegrityMonitor(config.appPath);
    this.networkMonitor = new NetworkMonitor();
    this.stealthReporter = new StealthReporter(appDataPath);
    this.licenseEnforcer = new LicenseEnforcer(
      config.publicKeyPath,
      config.onLicenseStatusChange
    );
    this.hwidGenerator = new HWIDGenerator();
  }

  /**
   * Initialize all security modules.
   * - Load/persist event queues
   * - Initialize integrity baseline if first run
   * - Perform initial checks
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load the stealth reporter queue from disk
      await this.stealthReporter.loadQueue();

      // Verify file integrity on startup
      const integrityResult = await this.integrityMonitor.verifyIntegrity();

      if (!integrityResult.intact) {
        // Report integrity violation before showing any UI
        const violationDescriptions: string[] = [
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
        console.error(
          '[SecurityOrchestrator] Integrity compromised. ' +
          'Modified files: ' + integrityResult.modified.join(', ') + ' ' +
          'Missing files: ' + integrityResult.missing.join(', ') + ' ' +
          'Contact suporte@atend-ia.com'
        );
      }

      // Run initial network security check
      const networkEvents = await this.networkMonitor.runAllChecks();
      for (const event of networkEvents) {
        await this.stealthReporter.enqueueEvent(event);
      }

      this.initialized = true;
    } catch (error) {
      console.error('[SecurityOrchestrator] Initialization failed:', error);
      // Never crash — degrade gracefully
      this.initialized = true;
    }
  }

  /**
   * Run a full security sweep across all modules.
   */
  async runSecurityCheck(): Promise<SecurityCheckResult> {
    const result: SecurityCheckResult = {
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
    } catch (error) {
      console.error('[SecurityOrchestrator] Security check failed:', error);
    }

    return result;
  }

  /**
   * Get the current Hardware ID.
   */
  async getHWID(): Promise<string> {
    try {
      return await this.hwidGenerator.generate();
    } catch (error) {
      console.error('[SecurityOrchestrator] Failed to get HWID:', error);
      return '';
    }
  }

  /**
   * Get the HWID with component hashes (for fuzzy matching).
   */
  async getHWIDWithComponents(): Promise<string> {
    try {
      return await this.hwidGenerator.generateWithComponents();
    } catch (error) {
      console.error('[SecurityOrchestrator] Failed to get component HWID:', error);
      return '';
    }
  }

  /**
   * Run license enforcement with the given serial and HWID.
   */
  async enforceLicense(serial: string, hwid: string) {
    try {
      return await this.licenseEnforcer.enforce(serial, hwid);
    } catch (error) {
      console.error('[SecurityOrchestrator] License enforcement failed:', error);
      return {
        accessLevel: 'readonly' as const,
        licenseInfo: null,
        clockManipulation: false,
        requiresOnlineValidation: true,
      };
    }
  }

  /**
   * Start all background monitoring tasks.
   */
  startAll(): void {
    try {
      this.integrityMonitor.startMonitoring(this.config.integrityCheckIntervalMs);
      this.networkMonitor.startMonitoring(this.config.networkCheckIntervalMs);
      this.stealthReporter.startReporting(this.config.reportIntervalMs);
    } catch (error) {
      console.error('[SecurityOrchestrator] Failed to start monitoring:', error);
    }
  }

  /**
   * Stop all background monitoring tasks.
   */
  stopAll(): void {
    try {
      this.integrityMonitor.stopMonitoring();
      this.networkMonitor.stopMonitoring();
      this.stealthReporter.stopReporting();
    } catch (error) {
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

// Re-export all modules and types for convenience
export { IntegrityMonitor } from './integrity-monitor';
export { NetworkMonitor } from './network-monitor';
export { StealthReporter } from './stealth-reporter';
export { LicenseEnforcer } from './license-enforcer';
export { HWIDGenerator } from './hwid-generator';
export * from './types';

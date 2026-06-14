// =============================================================================
// AtendIA Desktop — Hardware ID Generator
// Generates a stable SHA-256 HWID from motherboard UUID, CPU serial, primary
// MAC address, and disk serial. Supports fuzzy matching (3/4 components match).
// PowerShell commands executed with windowsHide: true.
// =============================================================================

import { exec } from 'child_process';
import * as crypto from 'crypto';

export class HWIDGenerator {
  /**
   * Get motherboard serial number via PowerShell CIM query.
   */
  private async getMotherboardUUID(): Promise<string> {
    try {
      const output = await this.execPowerShell(
        "Get-CimInstance Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber"
      );
      return output.trim();
    } catch (error) {
      console.error('[HWIDGenerator] Failed to get motherboard UUID:', error);
      return '';
    }
  }

  /**
   * Get CPU ProcessorId via PowerShell CIM query.
   */
  private async getCPUSerial(): Promise<string> {
    try {
      const output = await this.execPowerShell(
        "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty ProcessorId"
      );
      return output.trim();
    } catch (error) {
      console.error('[HWIDGenerator] Failed to get CPU serial:', error);
      return '';
    }
  }

  /**
   * Get primary MAC address of the first active network adapter.
   */
  private async getPrimaryMAC(): Promise<string> {
    try {
      const output = await this.execPowerShell(
        "Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1 -ExpandProperty MacAddress"
      );
      // Normalize MAC address: remove dashes/colons, lowercase
      return output.trim().replace(/[-:]/g, '').toLowerCase();
    } catch (error) {
      console.error('[HWIDGenerator] Failed to get MAC address:', error);
      return '';
    }
  }

  /**
   * Get primary disk drive serial number via PowerShell CIM query.
   */
  private async getDiskSerial(): Promise<string> {
    try {
      const output = await this.execPowerShell(
        "Get-CimInstance Win32_DiskDrive | Where-Object Index -eq 0 | Select-Object -ExpandProperty SerialNumber"
      );
      return output.trim();
    } catch (error) {
      console.error('[HWIDGenerator] Failed to get disk serial:', error);
      return '';
    }
  }

  /**
   * Generate individual component hashes for fuzzy matching.
   */
  private async getComponentHashes(): Promise<{
    motherboard: string;
    cpu: string;
    mac: string;
    disk: string;
  }> {
    const [motherboardUUID, cpuSerial, macAddress, diskSerial] = await Promise.all([
      this.getMotherboardUUID(),
      this.getCPUSerial(),
      this.getPrimaryMAC(),
      this.getDiskSerial(),
    ]);

    return {
      motherboard: crypto.createHash('sha256').update(`mb-${motherboardUUID}`).digest('hex'),
      cpu: crypto.createHash('sha256').update(`cpu-${cpuSerial}`).digest('hex'),
      mac: crypto.createHash('sha256').update(`mac-${macAddress}`).digest('hex'),
      disk: crypto.createHash('sha256').update(`disk-${diskSerial}`).digest('hex'),
    };
  }

  /**
   * Combine all hardware components and generate a stable SHA-256 HWID.
   */
  async generate(): Promise<string> {
    const [motherboardUUID, cpuSerial, macAddress, diskSerial] = await Promise.all([
      this.getMotherboardUUID(),
      this.getCPUSerial(),
      this.getPrimaryMAC(),
      this.getDiskSerial(),
    ]);

    // Combine all components in a deterministic order
    const combined = [
      `motherboard:${motherboardUUID}`,
      `cpu:${cpuSerial}`,
      `mac:${macAddress}`,
      `disk:${diskSerial}`,
    ].join('|');

    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Check if two HWIDs are from the same machine.
   * Fuzzy match: if at least `threshold` out of 4 component hashes match,
   * consider it the same machine. Default threshold = 3 (allows 1 component
   * change like RAM upgrade or secondary disk swap).
   */
  async fuzzyMatch(hwid1: string, hwid2: string, threshold: number = 3): Promise<boolean> {
    try {
      // We need the component hashes for comparison — but the HWID itself is
      // a single hash. To do fuzzy matching, we must store the component hashes
      // alongside the HWID. This method expects the hwid strings to include
      // component hash data in a special format:
      //   "fullhash:mb:cpu:mac:disk" (colon-separated)
      //
      // However, the public generate() method returns only the combined hash.
      // For fuzzy matching, callers should use generateComponentHWID() instead.

      // Parse the component hashes from the input strings
      const parts1 = hwid1.split(':');
      const parts2 = hwid2.split(':');

      // If these are plain hashes (no component data), fall back to exact match
      if (parts1.length < 5 || parts2.length < 5) {
        return hwid1 === hwid2;
      }

      let matches = 0;
      // Compare component hashes (indices 1-4)
      for (let i = 1; i <= 4; i++) {
        if (parts1[i] === parts2[i]) {
          matches++;
        }
      }

      return matches >= threshold;
    } catch (error) {
      console.error('[HWIDGenerator] Fuzzy match failed:', error);
      return hwid1 === hwid2;
    }
  }

  /**
   * Generate a HWID that includes component hashes for fuzzy matching.
   * Format: "combinedHash:mbHash:cpuHash:macHash:diskHash"
   * Use this if you need fuzzy matching later.
   */
  async generateWithComponents(): Promise<string> {
    const [motherboardUUID, cpuSerial, macAddress, diskSerial] = await Promise.all([
      this.getMotherboardUUID(),
      this.getCPUSerial(),
      this.getPrimaryMAC(),
      this.getDiskSerial(),
    ]);

    const combined = [
      `motherboard:${motherboardUUID}`,
      `cpu:${cpuSerial}`,
      `mac:${macAddress}`,
      `disk:${diskSerial}`,
    ].join('|');

    const fullHash = crypto.createHash('sha256').update(combined).digest('hex');
    const mbHash = crypto.createHash('sha256').update(`mb-${motherboardUUID}`).digest('hex');
    const cpuHash = crypto.createHash('sha256').update(`cpu-${cpuSerial}`).digest('hex');
    const macHash = crypto.createHash('sha256').update(`mac-${macAddress}`).digest('hex');
    const diskHash = crypto.createHash('sha256').update(`disk-${diskSerial}`).digest('hex');

    return `${fullHash}:${mbHash}:${cpuHash}:${macHash}:${diskHash}`;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Execute a PowerShell command silently (hidden window).
   */
  private execPowerShell(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(
        command,
        {
          windowsHide: true,
          timeout: 10000,
          shell: 'powershell.exe',
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stdout || '');
        }
      );
    });
  }
}

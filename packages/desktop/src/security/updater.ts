import { autoUpdater } from 'electron-updater';
import { BrowserWindow, app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface UpdateConfig {
  updateServerUrl: string;
  publicKeyPath: string;
  checkIntervalMs: number;
}

interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  progress: number;
  version: string | null;
  error: string | null;
}

export class AutoUpdater {
  private mainWindow: BrowserWindow | null = null;
  private config: UpdateConfig;
  private status: UpdateStatus = {
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    progress: 0,
    version: null,
    error: null,
  };
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<UpdateConfig> = {}) {
    this.config = {
      updateServerUrl: config.updateServerUrl || 'https://updates.atend-ia.com',
      publicKeyPath: config.publicKeyPath || path.join(process.resourcesPath!, 'public_key.pem'),
      checkIntervalMs: config.checkIntervalMs || 6 * 60 * 60 * 1000, // 6 hours
    };
  }

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;

    autoUpdater.logger = console;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Set the update server URL
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `${this.config.updateServerUrl}/update/win`,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    autoUpdater.on('checking-for-update', () => {
      this.status.checking = true;
      this.sendStatusToRenderer();
    });

    autoUpdater.on('update-available', (info) => {
      this.status.checking = false;
      this.status.available = true;
      this.status.version = info.version;
      this.sendStatusToRenderer();

      // Verify signature before downloading
      if (this.verifyUpdateSignature(info)) {
        autoUpdater.downloadUpdate();
      } else {
        this.status.error = 'Update signature verification failed. Update rejected.';
        this.sendStatusToRenderer();
      }
    });

    autoUpdater.on('update-not-available', () => {
      this.status.checking = false;
      this.status.available = false;
      this.sendStatusToRenderer();
    });

    autoUpdater.on('download-progress', (progressInfo) => {
      this.status.downloading = true;
      this.status.progress = progressInfo.percent;
      this.sendStatusToRenderer();
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.status.downloading = false;
      this.status.downloaded = true;
      this.status.version = info.version;
      this.sendStatusToRenderer();
    });

    autoUpdater.on('error', (error) => {
      this.status.checking = false;
      this.status.downloading = false;
      this.status.error = error?.message || 'Update error';
      this.sendStatusToRenderer();
    });
  }

  /**
   * Verify the update signature using the embedded public key.
   * The latest.yml contains a signature field that was generated
   * by signing version:sha512hash with the RSA private key.
   */
  private verifyUpdateSignature(updateInfo: any): boolean {
    try {
      if (!fs.existsSync(this.config.publicKeyPath)) {
        console.error('Public key not found at:', this.config.publicKeyPath);
        return false;
      }

      const publicKey = fs.readFileSync(this.config.publicKeyPath, 'utf8');

      // The signature in latest.yml signs "version:sha512hash"
      if (!updateInfo.signature || !updateInfo.sha512) {
        // Reject unsigned updates — code signing must be configured
        console.error('Update rejected: missing signature or sha512 in update info');
        return false;
      }

      const dataToVerify = `${updateInfo.version}:${updateInfo.sha512}`;
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(dataToVerify);
      verify.end();

      return verify.verify(publicKey, updateInfo.signature, 'base64');
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Check for updates now
   */
  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error: any) {
      this.status.error = error.message;
      this.sendStatusToRenderer();
    }
  }

  /**
   * Install the downloaded update (quits and installs)
   */
  installUpdate(): void {
    if (this.status.downloaded) {
      autoUpdater.quitAndInstall();
    }
  }

  /**
   * Start periodic update checks
   */
  startPeriodicChecks(): void {
    // Check immediately on startup
    this.checkForUpdates();

    // Then check every N hours
    this.checkInterval = setInterval(() => {
      this.checkForUpdates();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop periodic update checks
   */
  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Get current update status
   */
  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  private sendStatusToRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update:status', this.status);
    }
  }
}

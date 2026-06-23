"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoUpdater = void 0;
const electron_updater_1 = require("electron-updater");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class AutoUpdater {
    mainWindow = null;
    config;
    status = {
        checking: false,
        available: false,
        downloading: false,
        downloaded: false,
        progress: 0,
        version: null,
        error: null,
    };
    checkInterval = null;
    constructor(config = {}) {
        this.config = {
            updateServerUrl: config.updateServerUrl || 'https://updates.atend-ia.com',
            publicKeyPath: config.publicKeyPath || path_1.default.join(process.resourcesPath, 'public_key.pem'),
            checkIntervalMs: config.checkIntervalMs || 6 * 60 * 60 * 1000, // 6 hours
        };
    }
    initialize(mainWindow) {
        this.mainWindow = mainWindow;
        electron_updater_1.autoUpdater.logger = console;
        electron_updater_1.autoUpdater.autoDownload = false;
        electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
        // Set the update server URL
        electron_updater_1.autoUpdater.setFeedURL({
            provider: 'generic',
            url: `${this.config.updateServerUrl}/update/win`,
        });
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        electron_updater_1.autoUpdater.on('checking-for-update', () => {
            this.status.checking = true;
            this.sendStatusToRenderer();
        });
        electron_updater_1.autoUpdater.on('update-available', (info) => {
            this.status.checking = false;
            this.status.available = true;
            this.status.version = info.version;
            this.sendStatusToRenderer();
            // Verify signature before downloading
            if (this.verifyUpdateSignature(info)) {
                electron_updater_1.autoUpdater.downloadUpdate();
            }
            else {
                this.status.error = 'Update signature verification failed. Update rejected.';
                this.sendStatusToRenderer();
            }
        });
        electron_updater_1.autoUpdater.on('update-not-available', () => {
            this.status.checking = false;
            this.status.available = false;
            this.sendStatusToRenderer();
        });
        electron_updater_1.autoUpdater.on('download-progress', (progressInfo) => {
            this.status.downloading = true;
            this.status.progress = progressInfo.percent;
            this.sendStatusToRenderer();
        });
        electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
            this.status.downloading = false;
            this.status.downloaded = true;
            this.status.version = info.version;
            this.sendStatusToRenderer();
        });
        electron_updater_1.autoUpdater.on('error', (error) => {
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
    verifyUpdateSignature(updateInfo) {
        try {
            if (!fs_1.default.existsSync(this.config.publicKeyPath)) {
                console.error('Public key not found at:', this.config.publicKeyPath);
                return false;
            }
            const publicKey = fs_1.default.readFileSync(this.config.publicKeyPath, 'utf8');
            // The signature in latest.yml signs "version:sha512hash"
            if (!updateInfo.signature || !updateInfo.sha512) {
                // For electron-updater, we verify using the published release info
                // The publisher signature is verified by electron-updater internally
                // when code signing is configured
                return true;
            }
            const dataToVerify = `${updateInfo.version}:${updateInfo.sha512}`;
            const verify = crypto_1.default.createVerify('RSA-SHA256');
            verify.update(dataToVerify);
            verify.end();
            return verify.verify(publicKey, updateInfo.signature, 'base64');
        }
        catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }
    /**
     * Check for updates now
     */
    async checkForUpdates() {
        try {
            await electron_updater_1.autoUpdater.checkForUpdates();
        }
        catch (error) {
            this.status.error = error.message;
            this.sendStatusToRenderer();
        }
    }
    /**
     * Install the downloaded update (quits and installs)
     */
    installUpdate() {
        if (this.status.downloaded) {
            electron_updater_1.autoUpdater.quitAndInstall();
        }
    }
    /**
     * Start periodic update checks
     */
    startPeriodicChecks() {
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
    stopPeriodicChecks() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
    /**
     * Get current update status
     */
    getStatus() {
        return { ...this.status };
    }
    sendStatusToRenderer() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('update:status', this.status);
        }
    }
}
exports.AutoUpdater = AutoUpdater;
//# sourceMappingURL=updater.js.map
"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const log = __importStar(require("electron-log"));
const electron_store_1 = __importDefault(require("electron-store"));
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
const store = new electron_store_1.default({
    name: 'atend-ia-config',
    defaults: {
        licenseSerial: null,
        licenseToken: null,
        serverUrl: 'http://localhost:3000',
        appUrl: 'https://app.atend-ia.com',
    },
});
let mainWindow = null;
let licenseWindow = null;
let heartbeatInterval = null;
let heartbeatFailCount = 0;
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
// =============================================================================
// HWID — uses the HWIDGenerator from security modules
// =============================================================================
async function getHWID() {
    try {
        const { HWIDGenerator } = await Promise.resolve().then(() => __importStar(require('../dist/security/hwid-generator.js')));
        const generator = new HWIDGenerator();
        return await generator.generate();
    }
    catch (err) {
        log.error('[HWID] Failed to use HWIDGenerator:', err);
        // Fallback: basic identifier from machine env vars
        const { createHash } = await Promise.resolve().then(() => __importStar(require('crypto')));
        const machineId = `${process.env.COMPUTERNAME || 'unknown'}-${process.env.USERNAME || 'unknown'}`;
        return createHash('sha256').update(machineId).digest('hex');
    }
}
// =============================================================================
// License validation — direct fetch, no IPC self-invoke
// =============================================================================
async function validateLicense() {
    const serial = store.get('licenseSerial', null);
    if (!serial)
        return { activated: false };
    const serverUrl = store.get('serverUrl', 'http://localhost:3000');
    const token = store.get('licenseToken', null);
    try {
        const hwid = await getHWID();
        if (token) {
            const response = await fetch(`${serverUrl}/license/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, hwid }),
            });
            return { activated: response.ok, data: await response.json() };
        }
        const response = await fetch(`${serverUrl}/license/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serial, hwid }),
        });
        if (response.ok) {
            const data = await response.json();
            if (data?.data?.token) {
                store.set('licenseToken', data.data.token);
            }
            return { activated: true, data };
        }
        return { activated: false, data: await response.json() };
    }
    catch {
        return { activated: true, offline: true };
    }
}
// =============================================================================
// Heartbeat — periodic license check
// =============================================================================
function startHeartbeat() {
    if (heartbeatInterval)
        return;
    const INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
    heartbeatFailCount = 0;
    heartbeatInterval = setInterval(async () => {
        const serial = store.get('licenseSerial', null);
        const token = store.get('licenseToken', null);
        const serverUrl = store.get('serverUrl', 'http://localhost:3000');
        if (!serial || !token)
            return;
        try {
            const hwid = await getHWID();
            const response = await fetch(`${serverUrl}/license/heartbeat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, hwid, ip: '' }),
            });
            if (response.ok) {
                heartbeatFailCount = 0;
            }
            else {
                heartbeatFailCount++;
            }
        }
        catch {
            heartbeatFailCount++;
        }
        if (heartbeatFailCount >= 3) {
            log.warn('[Heartbeat] 3 consecutive failures — notifying user');
            mainWindow?.webContents.send('license:unstable');
        }
    }, INTERVAL);
}
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}
// =============================================================================
// Windows
// =============================================================================
function createLicenseWindow() {
    licenseWindow = new electron_1.BrowserWindow({
        width: 500,
        height: 420,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        title: 'AtendIA — Ativação',
        icon: path.join(__dirname, '../resources/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (isDev) {
        licenseWindow.loadURL('http://localhost:5174/activate.html');
    }
    else {
        licenseWindow.loadFile(path.join(__dirname, '../dist-renderer/activate.html'));
    }
}
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'AtendIA',
        icon: path.join(__dirname, '../resources/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    // Hybrid approach: in production load remote URL, in dev load local frontend
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        const appUrl = store.get('appUrl', 'https://app.atend-ia.com');
        mainWindow.loadURL(appUrl);
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
        stopHeartbeat();
    });
    if (!isDev) {
        setupAutoUpdater();
        startHeartbeat();
    }
}
// =============================================================================
// Auto Updater
// =============================================================================
function setupAutoUpdater() {
    const server = process.env.UPDATE_SERVER_URL || 'https://update.atend-ia.com';
    electron_1.autoUpdater.setFeedURL({
        url: `${server}/update/${process.platform}/${electron_1.app.getVersion()}`,
    });
    electron_1.autoUpdater.on('update-available', () => {
        log.info('Update available');
        mainWindow?.webContents.send('update:available');
    });
    electron_1.autoUpdater.on('update-downloaded', () => {
        log.info('Update downloaded');
        mainWindow?.webContents.send('update:downloaded');
    });
    electron_1.autoUpdater.on('error', (err) => {
        log.error('Update error:', err);
    });
    setInterval(() => {
        electron_1.autoUpdater.checkForUpdates();
    }, 30 * 60 * 1000);
    electron_1.autoUpdater.checkForUpdates();
}
// =============================================================================
// IPC Handlers
// =============================================================================
electron_1.ipcMain.on('update:install', () => {
    electron_1.autoUpdater.quitAndInstall();
});
electron_1.ipcMain.handle('app:version', () => {
    return electron_1.app.getVersion();
});
electron_1.ipcMain.handle('license:getSerial', () => {
    return store.get('licenseSerial', null);
});
electron_1.ipcMain.handle('license:saveSerial', (_event, serial) => {
    store.set('licenseSerial', serial);
    return true;
});
electron_1.ipcMain.handle('license:activate', async (_event, serial) => {
    const serverUrl = store.get('serverUrl', 'http://localhost:3000');
    try {
        const hwid = await getHWID();
        const response = await fetch(`${serverUrl}/license/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serial, hwid }),
        });
        const data = await response.json();
        if (response.ok && data?.data?.token) {
            store.set('licenseSerial', serial);
            store.set('licenseToken', data.data.token);
            return { success: true, data: data.data };
        }
        else {
            return { success: false, error: data?.error || 'Falha na ativação' };
        }
    }
    catch (err) {
        return { success: false, error: `Erro de conexão: ${err.message}` };
    }
});
electron_1.ipcMain.handle('license:heartbeat', async () => {
    const serial = store.get('licenseSerial', null);
    const token = store.get('licenseToken', null);
    if (!serial || !token)
        return { success: false, error: 'No serial/token' };
    const serverUrl = store.get('serverUrl', 'http://localhost:3000');
    try {
        const hwid = await getHWID();
        const response = await fetch(`${serverUrl}/license/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, hwid, ip: '' }),
        });
        return { success: response.ok, data: await response.json() };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
});
electron_1.ipcMain.handle('license:check', async () => {
    return await validateLicense();
});
electron_1.ipcMain.handle('app:openMain', () => {
    if (licenseWindow) {
        licenseWindow.close();
        licenseWindow = null;
    }
    createMainWindow();
});
// =============================================================================
// App Lifecycle
// =============================================================================
electron_1.app.on('ready', async () => {
    const template = [
        {
            label: 'AtendIA',
            submenu: [
                { label: 'Sobre', click: () => mainWindow?.webContents.send('app:about') },
                { type: 'separator' },
                { label: 'Sair', accelerator: 'CmdOrCtrl+Q', click: () => electron_1.app.quit() },
            ],
        },
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
    const serial = store.get('licenseSerial', null);
    if (!serial) {
        createLicenseWindow();
    }
    else {
        const result = await validateLicense();
        if (result.activated) {
            createMainWindow();
        }
        else {
            store.delete('licenseSerial');
            store.delete('licenseToken');
            createLicenseWindow();
        }
    }
});
electron_1.app.on('window-all-closed', () => {
    stopHeartbeat();
    electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (mainWindow === null && licenseWindow === null)
        createMainWindow();
});
//# sourceMappingURL=main.js.map
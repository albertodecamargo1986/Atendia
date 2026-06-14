import { app, BrowserWindow, autoUpdater, ipcMain, Menu, dialog } from 'electron';
import * as path from 'path';
import * as log from 'electron-log';
import Store from 'electron-store';

log.transports.file.level = 'info';
log.transports.console.level = 'debug';

const store = new Store({
  name: 'atend-ia-config',
  defaults: {
    licenseSerial: null as string | null,
    licenseToken: null as string | null,
    serverUrl: 'http://localhost:3000',
    appUrl: 'https://app.atend-ia.com',
  },
});

let mainWindow: BrowserWindow | null = null;
let licenseWindow: BrowserWindow | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let heartbeatFailCount = 0;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// =============================================================================
// HWID — uses the HWIDGenerator from security modules
// =============================================================================

async function getHWID(): Promise<string> {
  try {
    const { HWIDGenerator } = await import('../dist/security/hwid-generator.js');
    const generator = new HWIDGenerator();
    return await generator.generate();
  } catch (err) {
    log.error('[HWID] Failed to use HWIDGenerator:', err);
    // Fallback: basic identifier from machine env vars
    const { createHash } = await import('crypto');
    const machineId = `${process.env.COMPUTERNAME || 'unknown'}-${process.env.USERNAME || 'unknown'}`;
    return createHash('sha256').update(machineId).digest('hex');
  }
}

// =============================================================================
// License validation — direct fetch, no IPC self-invoke
// =============================================================================

async function validateLicense(): Promise<{ activated: boolean; data?: any; offline?: boolean }> {
  const serial = store.get('licenseSerial', null) as string | null;
  if (!serial) return { activated: false };

  const serverUrl = store.get('serverUrl', 'http://localhost:3000') as string;
  const token = store.get('licenseToken', null) as string | null;

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
  } catch {
    // Only grant offline access if there is a cached token and previous successful validation
    const cachedToken = store.get('licenseToken', null) as string | null;
    if (cachedToken) {
      // Offline tolerance: allow if we had a valid token, but flag as offline
      log.warn('[License] Network error — granting offline access with cached token');
      return { activated: true, offline: true };
    }
    // No cached token = first activation must succeed online
    log.error('[License] Network error and no cached token — activation required');
    return { activated: false, offline: true };
  }
}

// =============================================================================
// Heartbeat — periodic license check
// =============================================================================

function startHeartbeat() {
  if (heartbeatInterval) return;

  const INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
  heartbeatFailCount = 0;

  heartbeatInterval = setInterval(async () => {
    const serial = store.get('licenseSerial', null) as string | null;
    const token = store.get('licenseToken', null) as string | null;
    const serverUrl = store.get('serverUrl', 'http://localhost:3000') as string;

    if (!serial || !token) return;

    try {
      const hwid = await getHWID();
      const response = await fetch(`${serverUrl}/license/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, hwid, ip: '' }),
      });

      if (response.ok) {
        heartbeatFailCount = 0;
      } else {
        heartbeatFailCount++;
      }
    } catch {
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
  licenseWindow = new BrowserWindow({
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
  } else {
    licenseWindow.loadFile(path.join(__dirname, '../dist-renderer/activate.html'));
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
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
  } else {
    const appUrl = store.get('appUrl', 'https://app.atend-ia.com') as string;
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
  autoUpdater.setFeedURL({
    url: `${server}/update/${process.platform}/${app.getVersion()}`,
  });

  autoUpdater.on('update-available', () => {
    log.info('Update available');
    mainWindow?.webContents.send('update:available');
  });

  autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded');
    mainWindow?.webContents.send('update:downloaded');
  });

  autoUpdater.on('error', (err) => {
    log.error('Update error:', err);
  });

  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 30 * 60 * 1000);

  autoUpdater.checkForUpdates();
}

// =============================================================================
// IPC Handlers
// =============================================================================

ipcMain.on('update:install', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('license:getSerial', () => {
  return store.get('licenseSerial', null);
});

ipcMain.handle('license:saveSerial', (_event, serial: string) => {
  store.set('licenseSerial', serial);
  return true;
});

ipcMain.handle('license:activate', async (_event, serial: string) => {
  const serverUrl = store.get('serverUrl', 'http://localhost:3000') as string;

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
    } else {
      return { success: false, error: data?.error || 'Falha na ativação' };
    }
  } catch (err: any) {
    return { success: false, error: `Erro de conexão: ${err.message}` };
  }
});

ipcMain.handle('license:heartbeat', async () => {
  const serial = store.get('licenseSerial', null) as string | null;
  const token = store.get('licenseToken', null) as string | null;
  if (!serial || !token) return { success: false, error: 'No serial/token' };

  const serverUrl = store.get('serverUrl', 'http://localhost:3000') as string;

  try {
    const hwid = await getHWID();
    const response = await fetch(`${serverUrl}/license/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, hwid, ip: '' }),
    });

    return { success: response.ok, data: await response.json() };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('license:check', async () => {
  return await validateLicense();
});

// Config handlers — server URL and app URL
ipcMain.handle('config:getServerUrl', () => {
  return store.get('serverUrl', 'http://localhost:3001');
});

ipcMain.handle('config:setServerUrl', (_event, url: string) => {
  store.set('serverUrl', url);
  return true;
});

ipcMain.handle('config:getAppUrl', () => {
  return store.get('appUrl', 'http://localhost:5173');
});

ipcMain.handle('config:setAppUrl', (_event, url: string) => {
  store.set('appUrl', url);
  return true;
});

ipcMain.handle('app:openMain', () => {
  if (licenseWindow) {
    licenseWindow.close();
    licenseWindow = null;
  }
  createMainWindow();
});

// =============================================================================
// App Lifecycle
// =============================================================================

app.on('ready', async () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'AtendIA',
      submenu: [
        { label: 'Sobre', click: () => mainWindow?.webContents.send('app:about') },
        { type: 'separator' },
        { label: 'Sair', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  const serial = store.get('licenseSerial', null) as string | null;

  if (!serial) {
    createLicenseWindow();
  } else {
    const result = await validateLicense();

    if (result.activated) {
      createMainWindow();
    } else {
      store.delete('licenseSerial');
      store.delete('licenseToken');
      createLicenseWindow();
    }
  }
});

app.on('window-all-closed', () => {
  stopHeartbeat();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null && licenseWindow === null) createMainWindow();
});

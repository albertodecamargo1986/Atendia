"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    onUpdateAvailable: (callback) => electron_1.ipcRenderer.on('update:available', callback),
    onUpdateDownloaded: (callback) => electron_1.ipcRenderer.on('update:downloaded', callback),
    installUpdate: () => electron_1.ipcRenderer.send('update:install'),
    getAppVersion: () => electron_1.ipcRenderer.invoke('app:version'),
    // License
    getLicenseSerial: () => electron_1.ipcRenderer.invoke('license:getSerial'),
    saveLicenseSerial: (serial) => electron_1.ipcRenderer.invoke('license:saveSerial', serial),
    activateLicense: (serial) => electron_1.ipcRenderer.invoke('license:activate', serial),
    checkLicense: () => electron_1.ipcRenderer.invoke('license:check'),
    heartbeatLicense: () => electron_1.ipcRenderer.invoke('license:heartbeat'),
    // Navigation
    openMainWindow: () => electron_1.ipcRenderer.invoke('app:openMain'),
});
//# sourceMappingURL=preload.js.map
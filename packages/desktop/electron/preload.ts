import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateAvailable: (callback: () => void) =>
    ipcRenderer.on('update:available', callback),
  onUpdateDownloaded: (callback: () => void) =>
    ipcRenderer.on('update:downloaded', callback),
  installUpdate: () => ipcRenderer.send('update:install'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // License
  getLicenseSerial: () => ipcRenderer.invoke('license:getSerial'),
  saveLicenseSerial: (serial: string) => ipcRenderer.invoke('license:saveSerial', serial),
  activateLicense: (serial: string) => ipcRenderer.invoke('license:activate', serial),
  checkLicense: () => ipcRenderer.invoke('license:check'),
  heartbeatLicense: () => ipcRenderer.invoke('license:heartbeat'),

  // Server config
  getServerUrl: () => ipcRenderer.invoke('config:getServerUrl'),
  setServerUrl: (url: string) => ipcRenderer.invoke('config:setServerUrl', url),
  getAppUrl: () => ipcRenderer.invoke('config:getAppUrl'),
  setAppUrl: (url: string) => ipcRenderer.invoke('config:setAppUrl', url),

  // Navigation
  openMainWindow: () => ipcRenderer.invoke('app:openMain'),
});

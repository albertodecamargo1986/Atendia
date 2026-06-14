interface ElectronAPI {
  onUpdateAvailable: (callback: () => void) => void;
  onUpdateDownloaded: (callback: () => void) => void;
  installUpdate: () => void;
  getAppVersion: () => Promise<string>;
  getLicenseSerial: () => Promise<string | null>;
  saveLicenseSerial: (serial: string) => Promise<boolean>;
  activateLicense: (serial: string) => Promise<{ success: boolean; error?: string; data?: any }>;
  checkLicense: () => Promise<{ activated: boolean; data?: any; offline?: boolean; serial?: string }>;
  heartbeatLicense: () => Promise<{ success: boolean; data?: any }>;
  openMainWindow: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};

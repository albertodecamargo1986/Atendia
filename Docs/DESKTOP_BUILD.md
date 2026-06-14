# AtendIA Desktop — Guia de Build e Distribuição

---

## Estrutura do Projeto Electron

```
packages/desktop/
├── electron/
│   ├── main.ts              → processo principal (entry point)
│   ├── preload.ts           → bridge segura entre main e renderer
│   ├── ipc/
│   │   ├── license.ts       → IPC handlers de licença
│   │   ├── database.ts      → IPC handlers de banco local
│   │   ├── updater.ts       → IPC handlers de atualização
│   │   └── system.ts        → IPC handlers do sistema (paths, etc.)
│   └── services/
│       ├── database.ts      → conexão SQLite com better-sqlite3
│       ├── license.ts       → validação de licença
│       ├── backend.ts       → inicialização do backend Express embarcado
│       └── updater.ts       → configuração do electron-updater
├── src/                     → React frontend (compartilhado com web, adaptado)
│   ├── main.tsx
│   ├── App.tsx
│   └── ...
├── resources/
│   ├── icon.ico             → ícone do app (Windows)
│   ├── icon.icns            → ícone do app (macOS)
│   └── installer.nsh        → script NSIS customizado
├── package.json
├── electron-builder.yml     → configuração de build
├── tsconfig.json
└── vite.config.ts
```

---

## Configuração do electron-builder

```yaml
# electron-builder.yml
appId: com.atend-ia.desktop
productName: AtendIA
copyright: "© 2024 AtendIA"

directories:
  output: dist
  buildResources: resources

files:
  - "dist-electron/**/*"
  - "dist/**/*"
  - "node_modules/**/*"
  - "!node_modules/*/{CHANGELOG.md,README.md,readme.md}"
  - "!node_modules/**/{test,tests,__tests__}/**"

extraResources:
  - from: "resources/public_key.pem"
    to: "public_key.pem"

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico
  certificateFile: "${env.CERTIFICATE_FILE}"      # .pfx para code signing
  certificatePassword: "${env.CERTIFICATE_PASSWORD}"

nsis:
  oneClick: false                     # instalador com opções
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: AtendIA
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico
  installerHeader: resources/installer-header.bmp
  installerSidebar: resources/installer-sidebar.bmp
  license: resources/license.txt

publish:
  provider: s3
  bucket: atend-ia-releases
  region: us-east-1
  path: /desktop
  acl: public-read

# Auto-update
autoUpdate:
  provider: s3
  bucket: atend-ia-releases
  region: us-east-1
  path: /desktop
```

---

## Configuração do electron-updater (Auto-Update)

```typescript
// electron/services/updater.ts
import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';
import log from 'electron-log';

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false; // usuário confirma antes de baixar

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  // Verificar atualização ao iniciar (e depois a cada 4h)
  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update:progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update:ready');
  });
}

// IPC: usuário confirma instalação da atualização
ipcMain.on('update:install', () => {
  autoUpdater.quitAndInstall();
});
```

---

## Assinatura de Código (Code Signing)

**Por que é necessário:**
Sem code signing, o Windows Defender e SmartScreen mostram alertas assustadores ("Aplicativo desconhecido pode prejudicar seu computador"). Com code signing, o app é identificado como confiável.

### Tipos de Certificado
- **OV (Organization Validation):** ~USD 300/ano — mostra nome da empresa, alguns alertas
- **EV (Extended Validation):** ~USD 500/ano — reputação imediata, sem alertas SmartScreen

**Recomendação:** adquirir certificado EV para melhor experiência do usuário.

### Provedores Recomendados
- DigiCert
- Sectigo (Comodo)
- SSL.com

### Configuração no CI/CD
```yaml
# GitHub Actions — secrets necessários
CERTIFICATE_FILE: base64 do arquivo .pfx
CERTIFICATE_PASSWORD: senha do certificado
AWS_ACCESS_KEY_ID: para publicação no S3
AWS_SECRET_ACCESS_KEY: para publicação no S3
```

---

## Empacotando o Backend Node.js

O backend Express e todos os serviços Node.js rodam **dentro do processo Main** do Electron:

```typescript
// electron/main.ts
import { app, BrowserWindow } from 'electron';
import { startBackend } from './services/backend';

app.whenReady().then(async () => {
  // 1. Inicializa o banco SQLite
  await initDatabase();

  // 2. Inicia o backend Express na porta local
  await startBackend(3000);

  // 3. Cria a janela do app
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  // Frontend acessa o backend local
  win.loadURL('http://localhost:5173'); // em dev
  // ou win.loadFile('dist/index.html'); // em prod (app serve o React)
});
```

---

## SQLite com better-sqlite3

```typescript
// electron/services/database.ts
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database;

export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'database.db');
  db = new Database(dbPath);

  // WAL mode para melhor performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Executar migrações
  runMigrations(db);

  return db;
}

export function getDatabase() {
  if (!db) throw new Error('Database not initialized');
  return db;
}
```

---

## Scripts de Build

```json
// package.json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:renderer\" \"npm run dev:electron\"",
    "dev:renderer": "vite",
    "dev:electron": "tsc -p tsconfig.electron.json && electron .",
    "build": "npm run build:renderer && npm run build:electron",
    "build:renderer": "vite build",
    "build:electron": "tsc -p tsconfig.electron.json",
    "dist": "npm run build && electron-builder",
    "dist:win": "npm run build && electron-builder --win",
    "dist:publish": "npm run build && electron-builder --win --publish always",
    "build:clean": "rm -rf dist dist-electron"
  }
}
```

---

## Pipeline de Build CI/CD (GitHub Actions)

```yaml
# .github/workflows/desktop-release.yml
name: Desktop Release

on:
  push:
    tags: ['v*']

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Decode certificate
        run: echo "${{ secrets.CERTIFICATE_FILE }}" | base64 -d > certificate.pfx
        shell: bash

      - name: Build and sign
        run: npm run dist:publish
        env:
          CERTIFICATE_FILE: certificate.pfx
          CERTIFICATE_PASSWORD: ${{ secrets.CERTIFICATE_PASSWORD }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Checklist de Testes Antes de Cada Release

### Funcional
- [ ] Instalação limpa em Windows 10 e Windows 11
- [ ] Ativação de licença (serial válido)
- [ ] Bloqueio com serial inválido
- [ ] Conexão WhatsApp via QR Code
- [ ] Envio e recebimento de mensagem
- [ ] Agente de IA respondendo corretamente
- [ ] Takeover humano funcionando
- [ ] Auto-update a partir da versão anterior

### Performance
- [ ] App abre em menos de 5 segundos
- [ ] Uso de memória < 500MB em operação normal
- [ ] Sem vazamento de memória após 1 hora de uso

### Segurança
- [ ] Credenciais do WhatsApp criptografadas no disco
- [ ] Token de licença não manipulável
- [ ] API keys não expostas no processo renderer

### Distribuição
- [ ] Instalador assina com certificado válido
- [ ] Windows SmartScreen não bloqueia (com certificado EV)
- [ ] Antivírus não flageia como suspeito (VirusTotal)
- [ ] Auto-update detecta nova versão e baixa corretamente
- [ ] Desinstalação limpa (sem arquivos residuais)
```

---

## Publicação de Nova Versão

1. Atualizar `version` em `package.json`
2. Atualizar `CHANGELOG.md` com as mudanças
3. Commitar: `git commit -m "chore: release v1.5.0"`
4. Criar tag: `git tag v1.5.0 && git push origin v1.5.0`
5. GitHub Actions faz o build, assina e publica no S3 automaticamente
6. GitHub Release é criado com o CHANGELOG como release notes
7. Usuários com o app aberto recebem notificação de atualização disponível

# AtendIA — Stack Tecnológica Consolidada

---

## Dependências NPM por Camada

### Backend (`packages/backend`)
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "@bull-board/api": "^5.19.0",
    "@bull-board/express": "^5.19.0",
    "@prisma/client": "^5.14.0",
    "@whiskeysockets/baileys": "^6.7.0",
    "bcryptjs": "^2.4.3",
    "bullmq": "^5.7.0",
    "cheerio": "^1.0.0",
    "cors": "^2.8.5",
    "crypto": "^1.0.1",
    "dotenv": "^16.4.0",
    "express": "^4.19.0",
    "express-rate-limit": "^7.3.0",
    "helmet": "^7.1.0",
    "ioredis": "^5.3.0",
    "jsonwebtoken": "^9.0.0",
    "multer": "^1.4.5",
    "nodemailer": "^6.9.0",
    "openai": "^4.50.0",
    "pdf-parse": "^1.1.1",
    "pino": "^9.2.0",
    "pino-pretty": "^11.2.0",
    "puppeteer": "^22.10.0",
    "qrcode": "^1.5.3",
    "sharp": "^0.33.4",
    "socket.io": "^4.7.5",
    "stripe": "^15.12.0",
    "uuid": "^10.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/multer": "^1.4.11",
    "@types/nodemailer": "^6.4.15",
    "@types/node": "^20.14.0",
    "@types/uuid": "^10.0.0",
    "prisma": "^5.14.0",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

### Frontend (`packages/frontend`)
```json
{
  "dependencies": {
    "@hookform/resolvers": "^3.6.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-toast": "^1.1.5",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@tanstack/react-query": "^5.45.0",
    "axios": "^1.7.2",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "cmdk": "^1.0.0",
    "date-fns": "^3.6.0",
    "lucide-react": "^0.395.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.52.0",
    "react-router-dom": "^6.24.0",
    "recharts": "^2.12.7",
    "socket.io-client": "^4.7.5",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "zustand": "^4.5.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.6",
    "typescript": "^5.4.5",
    "vite": "^5.3.3"
  }
}
```

### Desktop (`packages/desktop`)
```json
{
  "dependencies": {
    "better-sqlite3": "^11.1.0",
    "electron-log": "^5.1.7",
    "electron-store": "^8.2.0",
    "electron-updater": "^6.2.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "concurrently": "^8.2.2",
    "electron": "^31.0.2",
    "electron-builder": "^24.13.3"
  }
}
```

---

## Configuração do Ambiente de Desenvolvimento

### Versões Recomendadas
```
Node.js:  20.x LTS (use nvm para gerenciar)
npm:      10.x
Docker:   24.x
Docker Compose: v2.x
Git:      2.40+
```

### Instalação do Node via nvm
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
nvm alias default 20
```

### Variáveis de Ambiente

**`packages/backend/.env`**
```env
# Ambiente
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Banco de dados
DATABASE_URL=postgresql://atend:atend@localhost:5432/atend_ia

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=dev-jwt-secret-mude-em-producao-abc123
JWT_REFRESH_SECRET=dev-refresh-secret-mude-em-producao-xyz789
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# IA
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_AI_MODEL=gpt-4o-mini

# WhatsApp
SESSION_ENCRYPTION_KEY=chave-de-32-bytes-para-criptografia

# E-mail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=dev@seudominio.com
SMTP_PASS=senha-de-app-gmail
EMAIL_FROM="AtendIA <noreply@atend-ia.com>"

# Arquivos
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET=atend-ia-dev
AWS_REGION=us-east-1

# Pagamentos (Fase 8)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...

# Licenciamento (Fase 8)
LICENSE_PRIVATE_KEY=<chave-privada-Ed25519-base64>
LICENSE_PUBLIC_KEY=<chave-publica-Ed25519-base64>

# URLs
FRONTEND_URL=http://localhost:5173
API_URL=http://localhost:3000
```

**`packages/frontend/.env`**
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_ENV=development
```

---

## Docker Compose para Desenvolvimento Local

```yaml
# docker-compose.yml (raiz do monorepo)
version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_USER: atend
      POSTGRES_PASSWORD: atend
      POSTGRES_DB: atend_ia
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U atend"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # Opcional: interface visual para o Redis
  redis-commander:
    image: rediscommander/redis-commander:latest
    environment:
      REDIS_HOSTS: local:redis:6379
    ports:
      - "8081:8081"
    depends_on:
      - redis

  # Opcional: interface visual para o banco
  adminer:
    image: adminer
    ports:
      - "8080:8080"
    depends_on:
      - postgres

volumes:
  postgres_data:
  redis_data:
```

---

## Estrutura do Monorepo

```
atend-ia/                          → raiz do monorepo
├── package.json                   → workspaces config
├── tsconfig.base.json             → config TypeScript base
├── .eslintrc.js                   → ESLint config
├── .prettierrc                    → Prettier config
├── docker-compose.yml             → serviços locais
├── .env.example                   → template de variáveis
├── .gitignore
├── README.md
│
├── packages/
│   ├── backend/                   → API Node.js + Express
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── middlewares/
│   │   │   ├── routes/
│   │   │   ├── workers/           → workers BullMQ
│   │   │   ├── lib/               → helpers e utils
│   │   │   └── index.ts           → entry point
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── frontend/                  → React app (SaaS)
│   │   ├── src/
│   │   │   ├── components/        → componentes reutilizáveis
│   │   │   ├── pages/             → páginas da aplicação
│   │   │   ├── hooks/             → custom hooks
│   │   │   ├── stores/            → Zustand stores
│   │   │   ├── services/          → chamadas de API
│   │   │   ├── types/             → tipos TypeScript
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   │
│   ├── desktop/                   → Electron app
│   │   ├── electron/              → código do processo main
│   │   ├── src/                   → React (compartilha com frontend)
│   │   ├── resources/             → ícones e assets do instalador
│   │   ├── electron-builder.yml
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                    → código compartilhado
│       ├── src/
│       │   ├── types/             → interfaces compartilhadas
│       │   ├── validators/        → schemas Zod compartilhados
│       │   └── utils/             → funções utilitárias
│       ├── package.json
│       └── tsconfig.json
│
├── docs/                          → documentação do projeto
├── online/docs/                   → docs da versão SaaS
├── desktop/docs/                  → docs da versão desktop
└── shared/docs/                   → docs compartilhadas
```

**`package.json` raiz:**
```json
{
  "name": "atend-ia",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "concurrently -n backend,frontend -c blue,green \"npm run dev -w backend\" \"npm run dev -w frontend\"",
    "dev:desktop": "npm run dev -w desktop",
    "build": "npm run build -w backend && npm run build -w frontend",
    "test": "npm run test --workspaces",
    "lint": "eslint packages/*/src --ext .ts,.tsx",
    "format": "prettier --write packages/*/src",
    "typecheck": "tsc --noEmit -p packages/backend/tsconfig.json && tsc --noEmit -p packages/frontend/tsconfig.json",
    "db:migrate": "npm run db:migrate -w backend",
    "db:seed": "npm run db:seed -w backend",
    "db:reset": "npm run db:reset -w backend",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f"
  }
}
```

---

## Configuração ESLint

```js
// .eslintrc.js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'import/order': ['error', { 'newlines-between': 'always' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
```

---

## Configuração Prettier

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100,
  "arrowParens": "always"
}
```

---

## Configuração TypeScript Base

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

---

## Pipeline de CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg15
        env:
          POSTGRES_USER: atend
          POSTGRES_PASSWORD: atend
          POSTGRES_DB: atend_ia_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run db:migrate
        env:
          DATABASE_URL: postgresql://atend:atend@localhost:5432/atend_ia_test
      - run: npm run test
        env:
          DATABASE_URL: postgresql://atend:atend@localhost:5432/atend_ia_test
          REDIS_URL: redis://localhost:6379

  deploy-staging:
    needs: [lint-and-typecheck, test]
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Deploy para staging..."
      # Configurar conforme infraestrutura escolhida (Railway, Render, VPS, etc.)
```

---

## Comandos de Desenvolvimento Mais Usados (Claude Code deve conhecer)

```bash
# === SETUP INICIAL ===
git clone <repo> && cd atend-ia
cp .env.example packages/backend/.env    # e editar com valores reais
npm install                              # instala todas as deps (workspaces)
npm run docker:up                        # sobe PostgreSQL e Redis
npm run db:migrate                       # cria as tabelas
npm run db:seed                          # popula dados de teste

# === DESENVOLVIMENTO ===
npm run dev                              # inicia backend + frontend simultaneamente
npm run dev -w backend                   # só o backend (porta 3000)
npm run dev -w frontend                  # só o frontend (porta 5173)
npm run dev:desktop                      # versão Electron

# === BANCO DE DADOS ===
npm run db:migrate                       # aplicar migrations pendentes
npx prisma migrate dev --name minha-migration -w backend  # criar nova migration
npx prisma studio -w backend             # abrir interface visual do banco
npm run db:seed                          # popular banco com dados de teste
npm run db:reset                         # CUIDADO: reseta e repopula o banco

# === QUALIDADE ===
npm run lint                             # verificar problemas de lint
npm run lint -- --fix                    # corrigir automaticamente o que for possível
npm run format                           # formatar com Prettier
npm run typecheck                        # verificar tipos sem compilar
npm run test                             # rodar todos os testes
npm run test -w backend                  # testes só do backend
npm run test -- --watch                  # modo watch

# === DOCKER ===
npm run docker:up                        # sobe serviços em background
npm run docker:down                      # para todos
npm run docker:logs                      # ver logs em tempo real
docker-compose logs -f backend           # logs de um serviço específico
docker exec -it atend-ia-postgres-1 psql -U atend -d atend_ia  # acessar banco

# === BUILD ===
npm run build                            # build de produção (backend + frontend)
npm run build -w desktop                 # build do Electron
npx electron-builder --win -w desktop   # gerar .exe (requer Windows ou Wine)

# === GIT ===
git status                               # ver estado atual
git log --oneline -10                    # últimos 10 commits
git stash                                # guardar mudanças temporariamente
git stash pop                            # restaurar mudanças guardadas
```

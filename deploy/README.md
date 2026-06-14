# AtendIA — Pasta de Deploy para Producao

## Estrutura

```
deploy/
  nginx.conf             — Configuracao do Nginx (frontend estatico + proxy API)
  Dockerfile.prod        — Dockerfile do backend Node.js
  docker-compose.prod.yml — Docker Compose de producao
  .env.example           — Template de variaveis de ambiente
  setup.sh               — Script de setup e deploy
```

## Como fazer deploy

### 1. Copiar esta pasta para o servidor

```bash
scp -r deploy/ usuario@seu-servidor:/opt/atendia/
```

### 2. No servidor, configurar o .env

```bash
cd /opt/atendia
cp .env.example .env
nano .env  # preencha todas as variaveis
```

Gerar JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Buildar e subir

```bash
chmod +x setup.sh
./setup.sh
```

Ou manualmente:

```bash
# Na maquina de desenvolvimento, buildar frontend e backend:
cd packages/frontend && npm run build
cd ../backend && npm run build

# No servidor, subir containers:
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Acessar

- **App**: http://seu-servidor (porta 80)
- **Health check**: http://seu-servidor/health
- **Bull Board**: http://seu-servidor/admin/queues

## Arquitetura de deploy

```
Internet → Nginx (porta 80)
              ├── /assets/*     → Arquivos estaticos (frontend buildado, cache 1 ano)
              ├── /*.js, /*.css  → Arquivos estaticos
              ├── /socket.io/*  → WebSocket proxy → Backend:3001
              ├── /auth|agents|... → API proxy → Backend:3001
              └── /*            → SPA fallback (index.html)

Backend (Node.js) → PostgreSQL (5432) + Redis (6379)
```

## Comandos uteis

```bash
# Ver logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx

# Reiniciar apenas o backend
docker compose -f docker-compose.prod.yml restart backend

# Parar tudo
docker compose -f docker-compose.prod.yml down

# Atualizar (apos novo build do frontend)
# 1. Buildar novo frontend localmente:
cd packages/frontend && npm run build
# 2. Copiar dist/ para o servidor (ou se o codigo ja esta la)
# 3. Reiniciar nginx:
docker compose -f docker-compose.prod.yml restart nginx
```

## SSL/HTTPS

Para HTTPS, use letsencrypt com certbot:

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d seudominio.com
```

Ou adicione um bloco server com SSL no nginx.conf apontando para os certificados.

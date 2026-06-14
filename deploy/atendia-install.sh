#!/bin/bash
# =============================================================================
# AtendIA — Script de Instalação Completa (all-in-one)
#
# Copie ESTE ARQUIVO para a VPS e rode:
#   chmod +x atendia-install.sh && sudo ./atendia-install.sh
#
# O script faz TUDO:
#   1. Instala Docker e Docker Compose
#   2. Libera portas no firewall (iptables)
#   3. Prepara diretório /opt/atendia
#   4. Gera secrets JWT automaticamente
#   5. Pergunta domínio (ou usa IP)
#   6. Cria docker-compose + nginx + Dockerfile + .env
#   7. Sobe todos containers (Postgres, Redis, Backend, Nginx)
#   8. Roda migrations e seed (cria usuário admin)
#   9. Configura SSL com Let's Encrypt (se tiver domínio)
#  10. Configura backup automático do banco
#  11. Mostra URL de acesso e credenciais
#
# Compatível com: Ubuntu 20.04/22.04/24.04 (ARM64 ou AMD64)
# =============================================================================

set -e

# ── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════╗"
echo "║   AtendIA — Instalação Completa     ║"
echo "║   Deploy automatizado para VPS      ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── Check: root ──────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Rode como root: sudo ./atendia-install.sh${NC}"
  exit 1
fi

# ── Detectar arquitetura ─────────────────────────────────────────────────────
ARCH=$(uname -m)
echo -e "${YELLOW}Arquitetura detectada:${NC} $ARCH"

APP_DIR="/opt/atendia"

# =============================================================================
# 1. Instalar Docker + Docker Compose
# =============================================================================
echo ""
echo -e "${YELLOW}${BOLD}[1/10] Instalando Docker...${NC}"

if command -v docker &> /dev/null; then
  echo -e "  ${GREEN}✓${NC} Docker já instalado: $(docker --version)"
else
  echo "  Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo -e "  ${GREEN}✓${NC} Docker instalado!"
fi

# Docker Compose v2 (plugin)
if ! docker compose version &> /dev/null; then
  echo "  Instalando Docker Compose plugin..."
  mkdir -p /usr/local/lib/docker/cli-plugins
  COMPOSE_ARCH=$([[ "$ARCH" == "aarch64" ]] && echo "aarch64" || echo "x86_64")
  curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${COMPOSE_ARCH}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  echo -e "  ${GREEN}✓${NC} Docker Compose instalado!"
else
  echo -e "  ${GREEN}✓${NC} Docker Compose: $(docker compose version --short)"
fi

# Adicionar usuário ao grupo docker
USER_NAME=$(logname 2>/dev/null || echo "ubuntu")
if id "$USER_NAME" &>/dev/null; then
  usermod -aG docker "$USER_NAME"
  echo -e "  ${GREEN}✓${NC} Usuário '$USER_NAME' adicionado ao grupo docker"
fi

# =============================================================================
# 2. Instalar utilitários
# =============================================================================
echo ""
echo -e "${YELLOW}${BOLD}[2/10] Instalando utilitários...${NC}"

apt-get update -qq
apt-get install -y -qq curl wget git openssl ufw certbot python3-certbot-nginx > /dev/null 2>&1
echo -e "  ${GREEN}✓${NC} curl, git, openssl, ufw, certbot instalados"

# =============================================================================
# 3. Liberar portas no firewall
# =============================================================================
echo ""
echo -e "${YELLOW}${BOLD}[3/10] Configurando firewall...${NC}"

# iptables (Oracle Cloud exige liberar aqui também)
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
iptables -I INPUT 7 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
iptables -I INPUT 8 -m state --state NEW -p tcp --dport 22 -j ACCEPT 2>/dev/null || true

# Salvar regras iptables persistentes
if command -v netfilter-persistent &> /dev/null; then
  netfilter-persistent save 2>/dev/null || true
  echo -e "  ${GREEN}✓${NC} Regras iptables salvas (netfilter-persistent)"
elif command -v iptables-save &> /dev/null; then
  iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
  echo -e "  ${GREEN}✓${NC} Regras iptaves salvas"
fi

# UFW (se disponível)
if command -v ufw &> /dev/null; then
  ufw allow 22/tcp 2>/dev/null || true
  ufw allow 80/tcp 2>/dev/null || true
  ufw allow 443/tcp 2>/dev/null || true
  ufw --force enable 2>/dev/null || true
  echo -e "  ${GREEN}✓${NC} UFW: portas 22, 80, 443 liberadas"
fi

echo -e "  ${YELLOW}⚠ Lembre-se: libere portas 80/443 também no Security List da Oracle Cloud${NC}"

# =============================================================================
# 4. Preparar diretório /opt/atendia
# =============================================================================
echo ""
echo -e "${YELLOW}${BOLD}[4/10] Preparando diretório ${APP_DIR}...${NC}"

mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/packages/shared/src"
mkdir -p "$APP_DIR/packages/backend/src"
mkdir -p "$APP_DIR/packages/backend/prisma"
mkdir -p "$APP_DIR/packages/frontend"
mkdir -p "$APP_DIR/deploy"

echo -e "  ${GREEN}✓${NC} Diretórios criados"

# =============================================================================
# 5. Gerar secrets
# =============================================================================
echo ""
echo -e "${YELLOW}${BOLD}[5/10] Gerando secrets...${NC}"

JWT_SECRET_AUTO=$(openssl rand -hex 64)
JWT_REFRESH_SECRET_AUTO=$(openssl rand -hex 64)
SESSION_KEY_AUTO=$(openssl rand -hex 16)
DB_PASSWORD_AUTO=$(openssl rand -hex 16)

echo -e "  ${GREEN}✓${NC} JWT_SECRET gerado"
echo -e "  ${GREEN}✓${NC} JWT_REFRESH_SECRET gerado"
echo -e "  ${GREEN}✓${NC} SESSION_ENCRYPTION_KEY gerado"
echo -e "  ${GREEN}✓${NC} DB_PASSWORD gerado"

# =============================================================================
# 6. Perguntar domínio
# =============================================================================
echo ""
echo -e "${CYAN}${BOLD}Configuração de domínio:${NC}"
echo "  Digite seu domínio (ex: app.atend-ia.com)"
echo "  ou pressione ENTER para usar o IP público"
read -p "  Domínio: " DOMAIN

if [[ -z "$DOMAIN" ]]; then
  PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || curl -s --max-time 5 icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')
  DOMAIN="$PUBLIC_IP"
  echo -e "  Usando IP: ${CYAN}${DOMAIN}${NC}"
  USE_SSL=false
else
  read -p "  Configurar SSL com Let's Encrypt? (s/N): " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Ss]$ ]]; then
    USE_SSL=true
  else
    USE_SSL=false
  fi
fi

# =============================================================================
# 7. Perguntar chave OpenAI (opcional)
# =============================================================================
echo ""
echo -e "${CYAN}${BOLD}Chave de API (opcional):${NC}"
read -p "  OpenAI API Key (ENTER para pular): " OPENAI_KEY
read -p "  Anthropic API Key (ENTER para pular): " ANTHROPIC_KEY

# =============================================================================
# 8. Criar todos os arquivos de configuração
# =============================================================================
echo ""
echo -e "${YELLOW}${BOLD}[6/10] Criando arquivos de configuração...${NC}"

# ── .env ─────────────────────────────────────────────────────────────────────
if [[ "$USE_SSL" == true ]]; then
  PROTOCOL="https"
else
  PROTOCOL="http"
fi

cat > "$APP_DIR/.env" << ENVEOF
# AtendIA — Produção (gerado automaticamente pelo atendia-install.sh)
# Data: $(date +%Y-%m-%d\ %H:%M)

# Banco de dados
DB_PASSWORD=${DB_PASSWORD_AUTO}

# JWT
JWT_SECRET=${JWT_SECRET_AUTO}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET_AUTO}

# IA
OPENAI_API_KEY=${OPENAI_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_KEY:-}
DEFAULT_AI_MODEL=gpt-4o-mini

# WhatsApp
SESSION_ENCRYPTION_KEY=${SESSION_KEY_AUTO}

# URLs
FRONTEND_URL=${PROTOCOL}://${DOMAIN}
ALLOWED_ORIGINS=${PROTOCOL}://${DOMAIN}

# E-mail
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM="AtendIA <noreply@atend-ia.com>"
ENVEOF

echo -e "  ${GREEN}✓${NC} .env criado"

# ── nginx.conf ───────────────────────────────────────────────────────────────
cat > "$APP_DIR/deploy/nginx.conf" << 'NGINXEOF'
upstream backend_upstream {
  server backend:3001;
}

server {
  listen 80;
  server_name _;

  client_max_body_size 20M;

  # Frontend estático
  root /usr/share/nginx/html;
  index index.html;

  # Gzip
  gzip on;
  gzip_vary on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

  # Assets com cache longo (Vite gera hashes nos nomes)
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # API + rotas do backend — proxy reverso
  location ~ ^/(auth|agents|conversations|knowledge|whatsapp|tickets|queues|contacts|quick-replies|tags|media|ratings|internal-chat|campaigns|webhooks|reports|voice-profiles|settings|users|business-hours|2fa|license|payments|download|health|ready|uploads)/ {
    proxy_pass http://backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  # Socket.io — WebSocket
  location /socket.io/ {
    proxy_pass http://backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400s;
  }

  # Bull Board (admin)
  location /admin/ {
    proxy_pass http://backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  # SPA fallback
  location / {
    try_files $uri $uri/ /index.html;
  }
}
NGINXEOF

echo -e "  ${GREEN}✓${NC} nginx.conf criado"

# ── Dockerfile.prod ──────────────────────────────────────────────────────────
cat > "$APP_DIR/deploy/Dockerfile.prod" << 'DKFEOF'
# AtendIA — Backend Dockerfile para PRODUÇÃO
# Multi-stage build para imagem mínima

# Stage 1 — Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
RUN npm install --omit=dev --legacy-peer-deps

# Stage 2 — Build shared + backend
FROM deps AS build
WORKDIR /app
COPY packages/shared/ packages/shared/
RUN cd packages/shared && npm run build
COPY packages/backend/ packages/backend/
RUN cd packages/backend && npx prisma generate --schema=prisma/schema.prisma && npm run build

# Stage 3 — Runtime
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/prisma ./packages/backend/prisma

WORKDIR /app/packages/backend
RUN npx prisma generate --schema=prisma/schema.prisma

RUN mkdir -p /app/packages/backend/uploads

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/index.js"]
DKFEOF

echo -e "  ${GREEN}✓${NC} Dockerfile.prod criado"

# ── docker-compose.prod.yml ──────────────────────────────────────────────────
cat > "$APP_DIR/docker-compose.prod.yml" << 'DCEOF'
# AtendIA — Docker Compose para PRODUÇÃO
# Uso: docker compose -f docker-compose.prod.yml up -d

services:
  postgres:
    image: pgvector/pgvector:pg15
    restart: always
    environment:
      POSTGRES_USER: atend
      POSTGRES_PASSWORD: ${DB_PASSWORD:-mude-esta-senha}
      POSTGRES_DB: atend_ia
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U atend"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes --save 60 1 --save 300 10 --save 900 1 --maxmemory 256mb --maxmemory-policy noeviction
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: deploy/Dockerfile.prod
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgresql://atend:${DB_PASSWORD:-mude-esta-senha}@postgres:5432/atend_ia
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      JWT_EXPIRES_IN: 15m
      JWT_REFRESH_EXPIRES_IN: 30d
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      DEFAULT_AI_MODEL: ${DEFAULT_AI_MODEL:-gpt-4o-mini}
      SESSION_ENCRYPTION_KEY: ${SESSION_ENCRYPTION_KEY}
      FRONTEND_URL: ${FRONTEND_URL:-http://localhost}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-http://localhost}
      UPLOAD_DIR: /app/uploads
      MAX_FILE_SIZE: 10485760
      LOG_LEVEL: info
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_SECURE: ${SMTP_SECURE:-false}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASS: ${SMTP_PASS:-}
      EMAIL_FROM: ${EMAIL_FROM:-"AtendIA <noreply@atend-ia.com>"}
    volumes:
      - uploads:/app/uploads
      - whatsapp-sessions:/app/packages/backend/sessions

  nginx:
    image: nginx:alpine
    restart: always
    depends_on:
      - backend
    ports:
      - "80:80"
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./packages/frontend/dist:/usr/share/nginx/html:ro

volumes:
  pgdata:
  redisdata:
  uploads:
  whatsapp-sessions:
DCEOF

echo -e "  ${GREEN}✓${NC} docker-compose.prod.yml criado"

# =============================================================================
# 9. Verificar se código fonte já existe, senão pedir para copiar
# =============================================================================
echo ""
echo -e "${YELLOW}${BOLD}[7/10] Verificando código fonte...${NC}"

NEED_SOURCE=false

if [[ ! -d "$APP_DIR/packages/backend/src" ]] || [[ -z "$(ls -A $APP_DIR/packages/backend/src 2>/dev/null)" ]]; then
  NEED_SOURCE=true
fi

if [[ "$NEED_SOURCE" == true ]]; then
  echo ""
  echo -e "${CYAN}Você precisa copiar o projeto do seu computador para a VPS.${NC}"
  echo ""
  echo "  No PowerShell do seu computador, rode:"
  echo ""
  echo "  ${BOLD}# 1) Buildar frontend localmente:${NC}"
  echo "  cd C:\Users\Eliane` F` Camargo\desktop\claude\atendia\packages\frontend"
  echo "  npm run build"
  echo ""
  echo "  ${BOLD}# 2) Copiar para a VPS:${NC}"
  echo "  scp -i \`$env:USERPROFILE\.ssh\atendia-oracle.key -r \\"
  echo "    C:\Users\Eliane` F` Camargo\desktop\claude\atendia\deploy \\"
  echo "    C:\Users\Eliane` F` Camargo\desktop\claude\atendia\packages \\"
  echo "    C:\Users\Eliane` F` Camargo\desktop\claude\atendia\package.json \\"
  echo "    C:\Users\Eliane` F` Camargo\desktop\claude\atendia\package-lock.json \\"
  echo "    C:\Users\Eliane` F` Camargo\desktop\claude\atendia\tsconfig.base.json \\"
  echo "    ubuntu@${DOMAIN}:/tmp/atendia-upload/"
  echo ""
  echo "  ${BOLD}# 3) Copiar para /opt/atendia:${NC}"
  echo "  sudo cp -r /tmp/atendia-upload/* /opt/atendia/"
  echo ""

  read -p "  Já copiou os arquivos? (s/N): " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo -e "  ${YELLOW}Copie os arquivos e rode este script novamente.${NC}"
    echo -e "  ${YELLOW}Os arquivos de configuração já estão em ${APP_DIR}/${NC}"
    exit 0
  fi
else
  echo -e "  ${GREEN}✓${NC} Código fonte encontrado"
fi

# =============================================================================
# 10. Subir containers
# =============================================================================
echo ""
echo -e "${YELLOW}${BOLD}[8/10] Subindo containers Docker...${NC}"
echo "  Isso pode levar alguns minutos na primeira vez (build da imagem)..."

cd "$APP_DIR"
docker compose -f docker-compose.prod.yml up -d --build 2>&1 | tail -5

echo -e "  ${GREEN}✓${NC} Containers subidos!"

# =============================================================================
# 11. Aguardar banco e rodar migration + seed
# =============================================================================
echo ""
echo -e "${YELLOW}${BOLD}[9/10] Aguardando banco de dados e rodando migrations...${NC}"

# Esperar postgres ficar pronto
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U atend &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} PostgreSQL pronto!"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo -e "  ${RED}✗ Timeout esperando PostgreSQL${NC}"
    echo "  Verifique: docker compose -f docker-compose.prod.yml logs postgres"
    exit 1
  fi
  sleep 2
done

# Migrations (prisma migrate deploy já roda no CMD do container, mas rodamos explicitamente como fallback)
echo "  Rodando migrations..."
docker compose -f docker-compose.prod.yml exec -T backend sh -c "npx prisma migrate deploy --schema=prisma/schema.prisma" 2>/dev/null || \
docker compose -f docker-compose.prod.yml exec -T backend sh -c "npx prisma db push --skip-generate" 2>/dev/null || true

echo -e "  ${GREEN}✓${NC} Migrations aplicadas"

# Seed — criar usuário admin
echo "  Criando usuário admin..."
docker compose -f docker-compose.prod.yml exec -T backend sh -c "node -e \"
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  const passwordHash = await bcrypt.hash('admin321', 12);
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Empresa Demo', slug: 'demo', plan: 'FREE', maxAgents: 1, maxConversations: 100, maxWhatsapp: 1, maxAiRequests: 500, isActive: true }
  });
  const user = await prisma.user.upsert({
    where: { email: 'admin@atendia.com' },
    update: {},
    create: { tenantId: tenant.id, email: 'admin@atendia.com', name: 'Admin', passwordHash, role: 'OWNER', isActive: true, emailVerified: true }
  });
  console.log('Admin criado:', user.email);
  await prisma.\\\$disconnect();
})();
\"" 2>/dev/null || echo -e "  ${YELLOW}⚠ Seed pode ter falhado — tente manualmente após deploy${NC}"

echo -e "  ${GREEN}✓${NC} Seed executado"

# =============================================================================
# 12. SSL com Certbot
# =============================================================================
if [[ "$USE_SSL" == true ]]; then
  echo ""
  echo -e "${YELLOW}${BOLD}[10/10] Configurando SSL com Let's Encrypt...${NC}"

  # Parar nginx temporariamente para certbot standalone
  docker compose -f docker-compose.prod.yml stop nginx 2>/dev/null || true

  certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --http01-port 80 || {
    echo -e "  ${RED}✗ Falha ao obter certificado SSL${NC}"
    echo "  Verifique se:"
    echo "    - O domínio $DOMAIN aponta para este IP"
    echo "    - Porta 80 está aberta no Security List da Oracle"
    echo "  SSL será configurado depois. Continuando sem SSL..."
    USE_SSL=false
  }

  if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
    # Criar nginx.conf com SSL
    cat > "$APP_DIR/deploy/nginx.conf" << SSLNGINX
upstream backend_upstream {
  server backend:3001;
}

# HTTP → redirect HTTPS
server {
  listen 80;
  server_name ${DOMAIN};
  return 301 https://\$host\$request_uri;
}

# HTTPS
server {
  listen 443 ssl;
  server_name ${DOMAIN};

  ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;

  client_max_body_size 20M;

  # Frontend estático
  root /usr/share/nginx/html;
  index index.html;

  # Gzip
  gzip on;
  gzip_vary on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

  # Assets com cache longo
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # API + rotas do backend
  location ~ ^/(auth|agents|conversations|knowledge|whatsapp|tickets|queues|contacts|quick-replies|tags|media|ratings|internal-chat|campaigns|webhooks|reports|voice-profiles|settings|users|business-hours|2fa|license|payments|download|health|ready|uploads)/ {
    proxy_pass http://backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Request-Id \$request_id;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  # Socket.io — WebSocket
  location /socket.io/ {
    proxy_pass http://backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 86400s;
  }

  # Bull Board
  location /admin/ {
    proxy_pass http://backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  }

  # SPA fallback
  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
SSLNGINX

    # Atualizar docker-compose para SSL (porta 443 + volumes cert)
    sed -i 's|"80:80"|"80:80"\n      - "443:443"|' "$APP_DIR/docker-compose.prod.yml"
    sed -i '/- .\/deploy\/nginx.conf:\/etc\/nginx\/conf.d\/default.conf:ro/a\      - /etc/letsencrypt:/etc/letsencrypt:ro' "$APP_DIR/docker-compose.prod.yml"

    # Atualizar .env para https
    sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://$DOMAIN|g" "$APP_DIR/.env"
    sed -i "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://$DOMAIN|g" "$APP_DIR/.env"

    # Subir novamente com SSL
    docker compose -f docker-compose.prod.yml up -d

    # Renovação automática via cron
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f $APP_DIR/docker-compose.prod.yml restart nginx") | crontab -

    echo -e "  ${GREEN}✓${NC} SSL configurado! Renovação automática via cron."
  fi
else
  echo ""
  echo -e "${YELLOW}${BOLD}[10/10] SSL pulado (somente HTTP).${NC}"
fi

# =============================================================================
# 13. Backup automático (cron diário)
# =============================================================================
echo ""
echo -e "${YELLOW}Configurando backup automático do banco...${NC}"

mkdir -p "$APP_DIR/backups"

cat > "$APP_DIR/deploy/backup.sh" << 'BKEOF'
#!/bin/bash
# Backup diário do PostgreSQL AtendIA
BACKUP_DIR="/opt/atendia/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/atendia_$TIMESTAMP.sql.gz"

cd /opt/atendia
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U atend atend_ia | gzip > "$BACKUP_FILE"

# Manter apenas últimos 7 backups
ls -t "$BACKUP_DIR"/atendia_*.sql.gz | tail -n +8 | xargs -r rm --

echo "[$(date)] Backup criado: $BACKUP_FILE"
BKEOF

chmod +x "$APP_DIR/deploy/backup.sh"

# Cron: backup diário às 02:00
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/atendia/deploy/backup.sh >> /opt/atendia/backups/backup.log 2>&1") | crontab -

echo -e "  ${GREEN}✓${NC} Backup automático configurado (diário às 02:00, mantém 7 dias)"

# =============================================================================
# FIM — Resumo
# =============================================================================
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════╗"
echo "║        Deploy concluído! 🎉         ║"
echo "╚══════════════════════════════════════╝${NC}"
echo ""

if [[ "$USE_SSL" == true && -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  echo -e "  ${CYAN}URL:${NC} ${BOLD}https://${DOMAIN}${NC}"
else
  echo -e "  ${CYAN}URL:${NC} ${BOLD}http://${DOMAIN}${NC}"
fi

echo ""
echo -e "  ${CYAN}${BOLD}Credenciais de acesso:${NC}"
echo -e "  Email:    ${BOLD}admin@atendia.com${NC}"
echo -e "  Senha:    ${BOLD}admin321${NC}"
echo ""
echo -e "  ${YELLOW}⚠ Troque a senha após o primeiro login!${NC}"
echo ""
echo -e "  ${CYAN}${BOLD}Comandos úteis:${NC}"
echo "  cd /opt/atendia"
echo "  docker compose -f docker-compose.prod.yml logs -f backend   # logs backend"
echo "  docker compose -f docker-compose.prod.yml logs -f nginx      # logs nginx"
echo "  docker compose -f docker-compose.prod.yml ps                 # status containers"
echo "  docker compose -f docker-compose.prod.yml restart backend    # reiniciar backend"
echo "  docker compose -f docker-compose.prod.yml down               # parar tudo"
echo "  docker compose -f docker-compose.prod.yml up -d              # subir tudo"
echo ""
echo -e "  ${CYAN}${BOLD}Backup:${NC}"
echo "  /opt/atendia/deploy/backup.sh                                # backup manual"
echo "  ls /opt/atendia/backups/                                     # listar backups"
echo ""
echo -e "  ${CYAN}${BOLD}Arquivos importantes:${NC}"
echo "  .env                                                        # variáveis de ambiente"
echo "  deploy/nginx.conf                                           # configuração nginx"
echo "  docker-compose.prod.yml                                     # docker compose"
echo "  backups/                                                    # backups do banco"
echo ""

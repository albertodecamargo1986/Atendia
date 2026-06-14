#!/bin/bash
# =============================================================================
# AtendIA — Deploy automatizado para Oracle Cloud Free Tier
#
# Rodar na VM Oracle Cloud (Ubuntu 22.04/24.04 ARM64 ou AMD64)
# Uso: chmod +x deploy-oracle.sh && sudo ./deploy-oracle.sh
# =============================================================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "=========================================="
echo "  AtendIA — Deploy Oracle Cloud"
echo "=========================================="
echo -e "${NC}"

# ============================================================================
# CHECK: Rodando como root?
# ============================================================================
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Rode como root: sudo ./deploy-oracle.sh${NC}"
   exit 1
fi

# ============================================================================
# 1. Instalar Docker + Docker Compose
# ============================================================================
echo -e "${YELLOW}[1/8] Instalando Docker...${NC}"

if command -v docker &> /dev/null; then
    echo "  Docker ja instalado: $(docker --version)"
else
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "  Docker instalado com sucesso!"
fi

# Adicionar usuario atual ao grupo docker
USER_NAME=$(logname 2>/dev/null || echo "ubuntu")
usermod -aG docker "$USER_NAME"
echo "  Usuario '$USER_NAME' adicionado ao grupo docker"

# ============================================================================
# 2. Instalar Certbot para SSL
# ============================================================================
echo -e "${YELLOW}[2/8] Instalando Certbot...${NC}"

apt-get update -qq
apt-get install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1
echo "  Certbot instalado!"

# ============================================================================
# 3. Criar diretorio do app
# ============================================================================
echo -e "${YELLOW}[3/8] Preparando diretorio /opt/atendia...${NC}"

APP_DIR="/opt/atendia"
mkdir -p "$APP_DIR"

# Copiar arquivos de deploy se estiver rodando de dentro do projeto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/docker-compose.prod.yml" ]]; then
    cp "$SCRIPT_DIR/docker-compose.prod.yml" "$APP_DIR/"
    cp "$SCRIPT_DIR/Dockerfile.prod" "$APP_DIR/"
    cp "$SCRIPT_DIR/nginx.conf" "$APP_DIR/"
    cp "$SCRIPT_DIR/.env.example" "$APP_DIR/"
    echo "  Arquivos de deploy copiados!"
else
    echo -e "${RED}  ERRO: Nao encontrei os arquivos de deploy em $SCRIPT_DIR${NC}"
    echo "  Copie manualmente a pasta deploy/ para /opt/atendia/"
    exit 1
fi

# Copiar codigo fonte
if [[ -d "$SCRIPT_DIR/../packages" ]]; then
    echo "  Copiando codigo fonte..."
    mkdir -p "$APP_DIR/packages/shared"
    mkdir -p "$APP_DIR/packages/backend"
    mkdir -p "$APP_DIR/packages/frontend"

    # Shared
    cp -r "$SCRIPT_DIR/../packages/shared/src" "$APP_DIR/packages/shared/" 2>/dev/null || true
    cp "$SCRIPT_DIR/../packages/shared/package.json" "$APP_DIR/packages/shared/" 2>/dev/null || true
    cp "$SCRIPT_DIR/../packages/shared/tsconfig.json" "$APP_DIR/packages/shared/" 2>/dev/null || true

    # Backend
    cp -r "$SCRIPT_DIR/../packages/backend/src" "$APP_DIR/packages/backend/" 2>/dev/null || true
    cp -r "$SCRIPT_DIR/../packages/backend/prisma" "$APP_DIR/packages/backend/" 2>/dev/null || true
    cp "$SCRIPT_DIR/../packages/backend/package.json" "$APP_DIR/packages/backend/" 2>/dev/null || true
    cp "$SCRIPT_DIR/../packages/backend/tsconfig.json" "$APP_DIR/packages/backend/" 2>/dev/null || true

    # Frontend (dist ja buildado)
    if [[ -d "$SCRIPT_DIR/../packages/frontend/dist" ]]; then
        cp -r "$SCRIPT_DIR/../packages/frontend/dist" "$APP_DIR/packages/frontend/"
        echo "  Frontend dist/ copiado!"
    else
        echo -e "${RED}  ATENCAO: packages/frontend/dist/ nao encontrado!${NC}"
        echo "  Build o frontend antes: cd packages/frontend && npm run build"
    fi

    # Root package.json
    cp "$SCRIPT_DIR/../package.json" "$APP_DIR/" 2>/dev/null || true
    cp "$SCRIPT_DIR/../package-lock.json" "$APP_DIR/" 2>/dev/null || true
    cp "$SCRIPT_DIR/../tsconfig.base.json" "$APP_DIR/" 2>/dev/null || true

    # Chave OpenAI (se existir no .env local)
    if [[ -f "$SCRIPT_DIR/../packages/backend/.env" ]]; then
        OPENAI_KEY=$(grep OPENAI_API_KEY "$SCRIPT_DIR/../packages/backend/.env" | cut -d= -f2-)
        if [[ -n "$OPENAI_KEY" && "$OPENAI_KEY" != "" ]]; then
            FOUND_OPENAI_KEY="$OPENAI_KEY"
        fi
    fi

    echo "  Codigo copiado!"
else
    echo -e "${RED}  ATENCAO: packages/ nao encontrado em $SCRIPT_DIR/..${NC}"
    echo "  Voce precisa copiar o projeto manualmente para /opt/atendia/"
fi

# ============================================================================
# 4. Configurar .env
# ============================================================================
echo -e "${YELLOW}[4/8] Configurando variaveis de ambiente...${NC}"

if [[ -f "$APP_DIR/.env" ]]; then
    echo "  .env ja existe — pulando"
else
    # Gerar secrets automaticamente
    JWT_SECRET_AUTO=$(openssl rand -hex 64)
    JWT_REFRESH_SECRET_AUTO=$(openssl rand -hex 64)
    SESSION_KEY_AUTO=$(openssl rand -hex 16)
    DB_PASSWORD_AUTO=$(openssl rand -hex 16)

    cat > "$APP_DIR/.env" << ENVEOF
# AtendIA — Producao (gerado automaticamente)
DB_PASSWORD=$DB_PASSWORD_AUTO
JWT_SECRET=$JWT_SECRET_AUTO
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET_AUTO
OPENAI_API_KEY=${FOUND_OPENAI_KEY:-}
ANTHROPIC_API_KEY=
DEFAULT_AI_MODEL=gpt-4o-mini
SESSION_ENCRYPTION_KEY=$SESSION_KEY_AUTO
FRONTEND_URL=http://localhost
ALLOWED_ORIGINS=http://localhost
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM="AtendIA <noreply@atend-ia.com>"
ENVEOF

    echo "  .env criado com secrets gerados automaticamente!"
    echo -e "  ${CYAN}Senha do banco: $DB_PASSWORD_AUTO${NC}"
fi

# ============================================================================
# 5. Perguntar dominio (ou usar IP)
# ============================================================================
echo ""
echo -e "${CYAN}Configuracao de dominio:${NC}"
read -p "  Digite seu dominio (ex: app.atend-ia.com) ou ENTER para usar IP: " DOMAIN

if [[ -z "$DOMAIN" ]]; then
    PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "SEU_IP_AQUI")
    DOMAIN="$PUBLIC_IP"
    echo "  Usando IP: $DOMAIN"
    USE_SSL=false
else
    read -p "  Configurar SSL automatico com Let's Encrypt? (s/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        USE_SSL=true
    else
        USE_SSL=false
    fi
fi

# Atualizar .env com o dominio
sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=http://$DOMAIN|g" "$APP_DIR/.env"
sed -i "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://$DOMAIN,https://$DOMAIN|g" "$APP_DIR/.env"

# ============================================================================
# 6. Atualizar nginx.conf com o dominio
# ============================================================================
echo -e "${YELLOW}[5/8] Configurando Nginx...${NC}"

if [[ "$USE_SSL" == true ]]; then
    # Atualizar nginx para suportar SSL (sera configurado pelo certbot)
    sed -i "s|listen 80;|listen 80;\n    server_name $DOMAIN;|g" "$APP_DIR/nginx.conf"
else
    sed -i "s|server_name _;|server_name $DOMAIN;|g" "$APP_DIR/nginx.conf"
fi

echo "  Nginx configurado para: $DOMAIN"

# ============================================================================
# 7. Subir containers
# ============================================================================
echo -e "${YELLOW}[6/8] Subindo containers Docker...${NC}"

cd "$APP_DIR"
docker compose -f docker-compose.prod.yml up -d --build

echo -e "${GREEN}  Containers subidos!${NC}"

# ============================================================================
# 8. Aguardar banco e rodar migration
# ============================================================================
echo -e "${YELLOW}[7/8] Aguardando banco de dados...${NC}"

# Esperar postgres ficar pronto
for i in {1..30}; do
    if docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U atend &>/dev/null; then
        echo "  PostgreSQL pronto!"
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo -e "${RED}  Timeout esperando PostgreSQL${NC}"
        exit 1
    fi
    sleep 2
done

# Rodar prisma db push (cria tabelas)
echo "  Rodando migrations..."
docker compose -f docker-compose.prod.yml exec -T backend sh -c "npx prisma db push --skip-generate" || true

# ============================================================================
# 9. SSL com Certbot
# ============================================================================
if [[ "$USE_SSL" == true ]]; then
    echo -e "${YELLOW}[8/8] Configurando SSL com Let's Encrypt...${NC}"

    # Instalar nginx no host para o certbot validar
    apt-get install -y -qq nginx > /dev/null 2>&1

    # Parar nginx do host temporariamente (nosso container usa porta 80)
    # O certbot precisa de um servidor web respondendo
    # Estrategia: usar standalone mode
    docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload 2>/dev/null || true

    certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --http01-port 80 || {
        echo -e "${RED}  Falha ao obter certificado SSL${NC}"
        echo "  Certifique-se que:"
        echo "  - O dominio $DOMAIN aponta para este IP"
        echo "  - Porta 80 esta aberta no Security List da Oracle"
    }

    if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
        # Atualizar nginx.conf para SSL
        cat > "$APP_DIR/nginx-ssl.conf" << SSLNGINX
upstream backend_upstream {
    server backend:3001;
}

server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    client_max_body_size 20M;

    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

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

    location /admin/ {
        proxy_pass http://backend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
SSLNGINX

        # Atualizar docker-compose para montar certificados SSL
        # Parar containers, reconfigurar e subir novamente
        docker compose -f docker-compose.prod.yml down

        # Atualizar o servico nginx no compose
        sed -i '/nginx:/a\    image: nginx:alpine' "$APP_DIR/docker-compose.prod.yml"

        # Copiar nginx-ssl.conf sobre nginx.conf
        cp "$APP_DIR/nginx-ssl.conf" "$APP_DIR/nginx.conf"

        # Adicionar volumes SSL e porta 443 no docker-compose
        sed -i 's|"80:80"|"80:80"\n      - "443:443"|g' "$APP_DIR/docker-compose.prod.yml"
        sed -i 's|- ./nginx.conf:/etc/nginx/conf.d/default.conf:ro|- ./nginx.conf:/etc/nginx/conf.d/default.conf:ro\n      - /etc/letsencrypt:/etc/letsencrypt:ro|g' "$APP_DIR/docker-compose.prod.yml"

        # Atualizar .env para https
        sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://$DOMAIN|g" "$APP_DIR/.env"
        sed -i "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://$DOMAIN|g" "$APP_DIR/.env"

        # Subir novamente
        docker compose -f docker-compose.prod.yml up -d

        # Renovacao automatica (cron)
        echo "0 0 * * * certbot renew --quiet && docker compose -f $APP_DIR/docker-compose.prod.yml restart nginx" | crontab -

        echo -e "${GREEN}  SSL configurado! Renovacao automatica via cron.${NC}"
    fi
else
    echo -e "${YELLOW}[8/8] SSL pulado (somente HTTP).${NC}"
fi

# ============================================================================
# FIM
# ============================================================================
echo ""
echo -e "${GREEN}=========================================="
echo "  Deploy concluido!"
echo "==========================================${NC}"
echo ""
if [[ "$USE_SSL" == true && -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
    echo -e "  URL: ${CYAN}https://$DOMAIN${NC}"
else
    echo -e "  URL: ${CYAN}http://$DOMAIN${NC}"
fi
echo ""
echo "  Comandos uteis:"
echo "    cd /opt/atendia"
echo "    docker compose -f docker-compose.prod.yml logs -f backend"
echo "    docker compose -f docker-compose.prod.yml logs -f nginx"
echo "    docker compose -f docker-compose.prod.yml restart backend"
echo "    docker compose -f docker-compose.prod.yml down"
echo ""
echo -e "  ${YELLOW}Nao esqueca de criar um usuario OWNER:${NC}"
echo "    docker compose -f docker-compose.prod.yml exec -T backend node dist/prisma/seed.js"
echo ""
echo -e "  ${YELLOW}Arquivo .env em:${NC} /opt/atendia/.env"
echo ""

#!/bin/bash
# AtendIA — Script de deploy para produção
# Uso: chmod +x setup.sh && ./setup.sh

set -e

echo "=========================================="
echo "  AtendIA — Setup de Produção"
echo "=========================================="

# 1. Verificar .env
if [ ! -f .env ]; then
    echo ""
    echo "[1/5] Criando .env a partir do .env.example..."
    cp .env.example .env
    echo "  Preencha as variaveis no arquivo .env antes de continuar!"
    echo "  JWT_SECRET e JWT_REFRESH_SECRET podem ser gerados com:"
    echo "    node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
    echo ""
    read -p "  Ja preencheu o .env? (s/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        echo "  Preencha o .env e rode este script novamente."
        exit 1
    fi
else
    echo "[1/5] .env ja existe — pulando"
fi

# 2. Buildar frontend
echo "[2/5] Buildando frontend..."
cd ../packages/frontend
npm run build
echo "  Frontend compilado em packages/frontend/dist/"

# 3. Buildar shared
echo "[3/5] Buildando shared..."
cd ../shared
npm run build
echo "  Shared compilado"

# 4. Buildar backend
echo "[4/5] Buildando backend..."
cd ../backend
npx prisma generate
npm run build
echo "  Backend compilado em packages/backend/dist/"

# 5. Subir containers
echo "[5/5] Subindo containers Docker..."
cd ../../deploy
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "=========================================="
echo "  Deploy concluido!"
echo "=========================================="
echo ""
echo "  Acesse: http://localhost (ou seu dominio)"
echo "  Health: http://localhost/health"
echo "  Admin:  http://localhost/admin/queues"
echo ""
echo "  Comandos uteis:"
echo "    docker compose -f docker-compose.prod.yml logs -f backend"
echo "    docker compose -f docker-compose.prod.yml logs -f nginx"
echo "    docker compose -f docker-compose.prod.yml restart backend"
echo "    docker compose -f docker-compose.prod.yml down"
echo ""

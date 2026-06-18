#!/bin/bash
# install-atendia-pro.sh - Instalacao Automatica para AtendIA
# Uso: bash install-atendia-pro.sh

set -euo pipefail

echo "================================================"
echo "  AtendIA - Instalacao Automatica Pro"
echo "  Para VPS Ubuntu 24.04 (Oracle Cloud)"
echo "================================================"
echo

# 1. Atualiza o sistema
echo "[1/9] Atualizando o sistema..."
sudo apt update && sudo apt upgrade -y

# 2. Instala dependencias basicas
echo "[2/9] Instalando dependencias basicas..."
sudo apt install -y curl git wget gnupg lsb-release ca-certificates apt-transport-https

# 3. Instala Node.js 22 (se nao existir)
echo "[3/9] Verificando Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo "Node.js $(node --version) e npm $(npm --version)"

# 4. Instala Docker (se nao existir)
echo "[4/9] Verificando Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=arm64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker ubuntu
fi
echo "Docker instalado."

# 5. Prepara diretorio e clona o repositorio
echo "[5/9] Clonando repositorio AtendIA..."
sudo mkdir -p /opt/atendia
sudo chown ubuntu:ubuntu /opt/atendia
cd /opt/atendia
if [ -d "Atendia" ]; then
    sudo rm -rf Atendia
fi
git clone https://github.com/albertodecamargo1986/Atendia.git
cd Atendia
echo "Repositorio clonado."

# 6. Configura .env
echo "[6/9] Configurando .env..."
if [ -f "deploy/.env.production" ]; then
    cp deploy/.env.production deploy/.env
elif [ -f ".env.example" ]; then
    cp .env.example deploy/.env
fi
echo ".env configurado."

# 7. Compila os pacotes (shared, backend, frontend)
echo "[7/9] Compilando pacotes..."
cd packages/shared && npm install && npm run build && cd ../..
cd packages/backend && npm install && npx prisma generate --schema=prisma/schema.prisma && npm run build && cd ../..
cd packages/frontend && npm install && npm run build && cd ../..
echo "Todos os pacotes compilados."

# 8. Copia arquivos de deploy para a raiz (para o Docker Compose funcionar)
echo "[8/9] Preparando Docker..."
cp deploy/docker-compose.prod.yml docker-compose.prod.yml
cp deploy/Dockerfile.prod Dockerfile.prod
cp deploy/nginx.conf nginx.conf

# 9. Sube os containers
echo "[9/9] Subindo containers com Docker Compose..."
cd /opt/atendia/Atendia
sudo docker compose -f docker-compose.prod.yml down 2>/dev/null || true
sudo docker compose -f docker-compose.prod.yml up -d --build

# Verifica se o sistema esta online
echo
echo "Verificando se o sistema esta online..."
MAX_TRIES=15
for i in $(seq 1 $MAX_TRIES); do
    echo "Tentativa $i/$MAX_TRIES..."
    sleep 10
    if curl -sf http://localhost/health > /dev/null 2>&1; then
        echo
        echo "================================================"
        echo "  INSTALACAO CONCLUIDA COM SUCESSO!"
        echo "================================================"
        echo
        echo "Acesse: http://163.176.179.132"
        echo
        echo "Credenciais padrao:"
        echo "  Email: admin@atendia.com"
        echo "  Senha: admin321"
        echo
        echo "Comandos uteis:"
        echo "  sudo docker ps"
        echo "  sudo docker compose -f docker-compose.prod.yml logs backend"
        echo "  sudo docker compose -f docker-compose.prod.yml logs nginx"
        echo
        exit 0
    fi
done

echo
echo "O sistema ainda esta subindo. Verifique com:"
echo "  sudo docker compose -f docker-compose.prod.yml logs backend"
echo "  sudo docker compose -f docker-compose.prod.yml logs nginx"
exit 1

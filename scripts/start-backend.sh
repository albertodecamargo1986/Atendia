#!/bin/bash
# AtendIA — Start backend inside WSL2
# Usage: wsl -d Ubuntu -- bash /root/atend-ia/scripts/start-backend.sh

set -e

# Load NVM
source ~/.nvm/nvm.sh 2>/dev/null || true
nvm use 22 2>/dev/null || true

# Ensure project is synced to WSL2 native fs
if [ ! -d /root/atend-ia/packages/backend/node_modules ]; then
  echo "Syncing project to WSL2 native filesystem..."
  rsync -a --exclude=node_modules --exclude=.git /mnt/c/Users/Eliane\ F\ Camargo/Desktop/Claude/AtendIA/ /root/atend-ia/
  cd /root/atend-ia && npm install
  cd /root/atend-ia/packages/backend && npx prisma generate --schema=prisma/schema.prisma
fi

# Kill any existing backend
pkill -f 'tsx.*src/index.ts' 2>/dev/null || true
sleep 1

# Start backend
cd /root/atend-ia/packages/backend
export DATABASE_URL="postgresql://atend:atend@localhost:5432/atend_ia"
export JWT_SECRET="dev-jwt-secret-mude-em-producao-abc123"
export JWT_REFRESH_SECRET="dev-refresh-secret-mude-em-producao-xyz789"
export FRONTEND_URL="http://localhost:5173"
export REDIS_URL="redis://localhost:6379"
export LOG_LEVEL="debug"
export PORT="3000"

nohup npx tsx src/index.ts > /tmp/atendia-backend.log 2>&1 &
echo "Backend PID: $!"
echo "Log: /tmp/atendia-backend.log"

# Wait and verify
sleep 3
if curl -s http://localhost:3000/health | grep -q ok; then
  echo "Backend is running on port 3000"
else
  echo "ERROR: Backend failed to start. Check /tmp/atendia-backend.log"
  exit 1
fi

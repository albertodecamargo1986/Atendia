#!/bin/bash
set -e
cd '/mnt/c/Users/Eliane F Camargo/Desktop/Claude/AtendIA'

# Start Docker
docker compose up -d

# Wait for postgres
echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec atendia-postgres-1 pg_isready -U atend -d atend_ia 2>/dev/null; then
    echo "PostgreSQL ready!"
    break
  fi
  sleep 1
done

# Run seed via Node.js (bcrypt-safe, no shell escaping issues)
source ~/.nvm/nvm.sh 2>/dev/null || true
nvm use 22 2>/dev/null || true

cd /root/atend-ia/packages/backend 2>/dev/null || cd packages/backend
DATABASE_URL="postgresql://atend:atend@localhost:5432/atend_ia" npx tsx prisma/seed.ts

echo ""
echo "=== Seed complete ==="
echo "Email: albertodecamargo@gmail.com"
echo "Password: admin321"
echo ""

# Verify
docker exec atendia-postgres-1 psql -U atend -d atend_ia -c "SELECT email, role FROM \"User\" WHERE email='albertodecamargo@gmail.com';" || true

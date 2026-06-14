#!/bin/bash
# AtendIA — Dev startup script (run inside WSL2)
set -e

PROJECT_DIR="/mnt/c/Users/Eliane F Camargo/Desktop/Claude/AtendIA"
cd "$PROJECT_DIR"

echo "=== Starting Docker services ==="
docker compose up -d

echo "=== Waiting for PostgreSQL ==="
for i in $(seq 1 30); do
  if docker exec atendia-postgres-1 pg_isready -U atend -d atend_ia 2>/dev/null; then
    echo "PostgreSQL is ready!"
    break
  fi
  sleep 1
done

echo "=== Seeding database ==="
# Pre-computed bcrypt hash for 'At3nd1A@2024' (12 rounds)
BCRYPT_HASH='$2a$12$Lj/Fh1eSji89qAp261WC.OZygvBr/YtKn40Vij1kals8n87YbWM6u'

docker exec atendia-postgres-1 psql -U atend -d atend_ia <<SEEDSQL
INSERT INTO "Tenant" (id, name, slug, plan, "isActive", "maxAgents", "maxConversations", "maxWhatsapp", "maxAiRequests", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Empresa Demo', 'demo', 'FREE', true, 1, 100, 1, 500, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role, "isActive", "emailVerified", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t.id, 'admin@atend-ia.com', 'Admin Demo',
'$2a\$12\$Lj/Fh1eSji89qAp261WC.OZygvBr/YtKn40Vij1kals8n87YbWM6u',
'OWNER', true, true, NOW(), NOW()
FROM "Tenant" t WHERE t.slug='demo'
AND NOT EXISTS (SELECT 1 FROM "User" WHERE email='admin@atend-ia.com');
SEEDSQL

echo ""
echo "=== Seed complete ==="
echo "Email: admin@atend-ia.com"
echo "Password: At3nd1A@2024"

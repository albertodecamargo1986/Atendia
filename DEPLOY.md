# GUIA RÁPIDO DE DEPLOY — AtendIA VPS

## Pré-requisitos

- VPS com Ubuntu 22.04/24.04 (ARM64 ou AMD64)
- Mínimo: 2GB RAM, 2 vCPUs, 20GB SSD
- Domínio apontado para o IP da VPS (opcional, mas recomendado)
- Portas 80 e 443 liberadas no firewall

## Deploy Automático (recomendado)

```bash
# 1. Faça upload do projeto para a VPS
scp -r /caminho/para/atendia ubuntu@seu-servidor:~/atendia

# 2. Execute o script de instalação na VPS
cd ~/atendia
sudo ./deploy/atendia-install.sh
```

O script fará automaticamente:
- Instalar Docker + Docker Compose
- Configurar firewall (portas 22, 80, 443)
- Gerar secrets JWT, SESSION_ENCRYPTION_KEY e DB_PASSWORD
- Configurar domínio ou IP
- Fazer build e subir todos os containers
- Rodar migrations e seed (cria usuário admin)
- Configurar SSL com Let's Encrypt (se domínio informado)
- Configurar backup automático diário

## Deploy Manual (passo a passo)

### 1. Configurar ambiente

```bash
# Copiar .env de produção
cp deploy/.env.production .env

# Editar variáveis obrigatórias
nano .env
# Preencher: JWT_SECRET, JWT_REFRESH_SECRET, SESSION_ENCRYPTION_KEY
# Opcional: OPENAI_API_KEY, ANTHROPIC_API_KEY, MP_ACCESS_TOKEN
```

### 2. Build do frontend

```bash
cd packages/frontend
npm run build
cd ../..
```

### 3. Subir containers

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

### 4. Verificar health checks

```bash
curl http://localhost/health
curl http://localhost/ready
```

### 5. Configurar SSL (se tiver domínio)

```bash
sudo certbot certonly --standalone -d app.seudominio.com
# Depois atualizar deploy/nginx.conf com SSL
```

## Estrutura de Produção

```
/opt/atendia/
├── .env                      # Variáveis de ambiente
├── docker-compose.prod.yml   # Orquestração
├── deploy/
│   ├── Dockerfile.prod       # Build multi-stage
│   ├── nginx.conf            # Proxy reverso + SSL
│   └── backup.sh             # Backup automático
├── packages/
│   ├── backend/dist/         # Backend compilado
│   ├── frontend/dist/        # Frontend compilado
│   └── shared/dist/          # Shared compilado
├── backups/                  # Backups do banco (diário)
└── uploads/                  # Arquivos enviados
```

## Comandos Úteis

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx

# Status
docker compose -f docker-compose.prod.yml ps

# Reiniciar
docker compose -f docker-compose.prod.yml restart backend

# Atualizar (após alterações no código)
docker compose -f docker-compose.prod.yml up -d --build backend

# Backup manual
bash deploy/backup.sh

# Listar backups
ls -lh backups/

# Restaurar backup
gunzip < backups/atendia_20250101_020000.sql.gz | docker exec -i atendia-postgres-1 psql -U atend atend_ia
```

## Variáveis de Ambiente Obrigatórias

| Variável | Descrição | Gerar com |
|----------|-----------|-----------|
| `JWT_SECRET` | Chave para assinar tokens JWT | `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | Chave para refresh tokens | `openssl rand -hex 64` |
| `SESSION_ENCRYPTION_KEY` | Chave para criptografia (32+ chars) | `openssl rand -hex 16` |
| `OPENAI_API_KEY` | Chave da OpenAI (para agente IA) | Conta OpenAI |
| `MP_ACCESS_TOKEN` | Token do Mercado Pago | Conta Mercado Pago |

## Credenciais Padrão (seed)

- Email: `admin@atendia.com`
- Senha: `admin321`

⚠️ Troque a senha após o primeiro login!

## Verificação Pós-Deploy

- [ ] Frontend acessível via navegador
- [ ] Login funciona (admin@atendia.com / admin321)
- [ ] Health check: GET /health → `{"status":"ok"}`
- [ ] Readiness check: GET /ready → `{"status":"ok"}`
- [ ] WebSocket conecta (verificar console do navegador)
- [ ] Criação de agente funciona
- [ ] Conexão WhatsApp (se configurado)
- [ ] SSL configurado (se domínio)
- [ ] Backup automático rodando
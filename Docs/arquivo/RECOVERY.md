# AtendIA — Guia de Recuperação de Sessão

> Use este arquivo quando a conexão cair, o terminal fechar ou uma nova sessão começar do zero.

---

## Template de Mensagem para Retomar (copie e envie ao Claude)

```
Retomar projeto AtendIA — leia PROGRESS.md e me informe o estado atual antes de continuar.
```

---

## Ordem de Leitura ao Retomar

O Claude Code deve ler os arquivos **nesta ordem exata** antes de escrever qualquer linha de código:

1. `docs/PROGRESS.md` — **estado atual**, o que foi feito, o que está pendente
2. `docs/OVERVIEW.md` — visão geral do produto para contextualização
3. `docs/ARCHITECTURE.md` — decisões técnicas já tomadas (não questionar sem motivo)
4. O arquivo do módulo específico em que estava trabalhando (ex: `online/docs/MODULE_01_AUTH.md`)

**Regra de ouro:** nunca reescrever código já funcional sem antes verificar o que existe.

---

## Checklist de Verificação do Estado do Projeto

Execute estes comandos ao retomar para entender o estado atual:

### 1. Verificar Git
```bash
git status                    # arquivos modificados não commitados
git log --oneline -10         # últimos 10 commits
git stash list                # stashes pendentes
```

### 2. Verificar serviços Docker
```bash
docker ps                     # containers rodando
docker-compose ps             # status de cada serviço
docker-compose logs --tail=20 # últimas linhas de log
```

### 3. Verificar banco de dados
```bash
npx prisma migrate status     # migrações pendentes
npx prisma studio             # interface visual do banco (opcional)
```

### 4. Verificar processos Node.js
```bash
ps aux | grep node            # processos Node rodando
lsof -i :3000                 # verificar se backend está na porta 3000
lsof -i :5173                 # verificar se frontend (Vite) está na porta 5173
```

### 5. Verificar dependências
```bash
npm install                   # instalar deps faltantes (raiz do monorepo)
npm run build --workspaces    # verificar se tudo compila
```

### 6. Iniciar ambiente de desenvolvimento
```bash
docker-compose up -d          # sobe PostgreSQL e Redis
npm run dev                   # inicia backend e frontend em paralelo
```

---

## Comandos de Desenvolvimento Mais Usados

```bash
# Desenvolvimento
npm run dev                         # inicia tudo (backend + frontend)
npm run dev --workspace=backend      # só o backend
npm run dev --workspace=frontend     # só o frontend

# Banco de dados
npx prisma migrate dev --name nome  # criar nova migration
npx prisma migrate reset             # resetar banco (CUIDADO: apaga dados)
npx prisma db seed                   # popular banco com dados de teste
npx prisma generate                  # regenerar client após mudanças no schema

# Testes
npm run test                         # todos os testes
npm run test:watch                   # modo watch
npm run test:coverage                # com cobertura

# Build
npm run build                        # build de produção
npm run build:desktop                # build do Electron (.exe)

# Docker
docker-compose up -d                 # sobe serviços em background
docker-compose down                  # para todos os serviços
docker-compose down -v               # para e apaga volumes (CUIDADO)
docker-compose logs -f backend       # logs em tempo real do backend
```

---

## Regras para o Claude Code ao Retomar

1. **Nunca assumir** que o código está igual à última vez. Verificar arquivos antes de modificar.
2. **Nunca reescrever** um módulo funcional. Se algo está funcionando, não toque sem necessidade.
3. **Sempre verificar** se há migrações pendentes antes de rodar o sistema.
4. **Sempre commitar** o que foi feito ao final de cada sessão com mensagem descritiva.
5. **Sempre atualizar** o `docs/PROGRESS.md` antes de encerrar a sessão.
6. **Sempre perguntar** antes de tomar decisões arquiteturais que contradizem o que está em `ARCHITECTURE.md`.

---

## Situações Comuns de Recuperação

### "O banco de dados está vazio"
```bash
docker-compose up -d postgres
npx prisma migrate dev
npx prisma db seed
```

### "O Redis não está respondendo"
```bash
docker-compose restart redis
redis-cli ping  # deve retornar PONG
```

### "A sessão do WhatsApp caiu"
- Acessar o painel Admin → WhatsApp Sessions
- Clicar em "Reconectar" para escanear novo QR Code
- As mensagens em fila serão reprocessadas automaticamente

### "O build do Electron falhou"
```bash
cd packages/desktop
npm run build:clean
npm run build
```

### "Erro de tipo TypeScript em vários arquivos"
```bash
npx prisma generate    # regenera os tipos do Prisma
npm run typecheck      # verifica erros sem compilar
```

---

## Variáveis de Ambiente Necessárias

Criar arquivo `.env` na raiz e em cada package. Variáveis mínimas:

```env
# Banco
DATABASE_URL=postgresql://atend:atend@localhost:5432/atend_ia

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=seu-segredo-super-seguro-aqui
JWT_REFRESH_SECRET=outro-segredo-para-refresh

# IA
OPENAI_API_KEY=sk-...
# ou
ANTHROPIC_API_KEY=sk-ant-...

# E-mail (para recuperação de senha e notificações)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu@email.com
SMTP_PASS=senha-de-app

# Pagamentos (Fase 8)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
```

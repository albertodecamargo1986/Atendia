# Contrato comum entre agentes (Fases 1–5) — NÃO violar

Plano completo: C:\Users\Eliane F Camargo\.claude\plans\pode-fazer-uma-analise-jolly-pie.md

## Roteamento (substitui o nginx com regex/Accept)
- Backend monta TODAS as rotas de API sob o prefixo `/api` (ex.: `/api/auth/login`, `/api/tickets`, `/api/admin/...`).
  Nada de rotas de API na raiz.
- Na raiz do backend ficam apenas: `/health`, `/ready`, `/uploads/*` (estático autenticado), `/socket.io` (Socket.IO).
- Bull Board em `/api/admin/queues` (basePath correspondente), só SUPER_ADMIN.
- Nova rota pública: `GET /api/public/plans` → lista de planos ativos de PlanConfig
  `[{ id, key, name, description, priceMonthly, features: string[], limits: {...}, highlighted }]` (usar os campos reais do model).
- Webhooks de pagamento: `/api/payments/webhook/mercadopago`, `/api/payments/webhook/stripe`.
- Proxy (Caddy em produção, Vite em dev): `/api/*`, `/socket.io/*`, `/uploads/*`, `/health` → backend:3001 (SEM strip de prefixo).
  Todo o resto → SPA (`index.html`).

## Frontend
- axios `baseURL = import.meta.env.VITE_API_URL || '/api'` (em produção VITE_API_URL fica vazio).
- Socket.IO: URL = `import.meta.env.VITE_WS_URL || window.location.origin`, path `/socket.io`.
- Mídias: URLs `/uploads/<tenantId>/<arquivo>` servidas com cookie `accessToken` (httpOnly) OU header Bearer.

## Papéis
- Enum `Role` ganha `SUPER_ADMIN` (dono da plataforma). Ordem: SUPER_ADMIN, OWNER, ADMIN, SUPERVISOR, OPERATOR.
- `/api/admin/*` e Bull Board: somente SUPER_ADMIN. Cadastro público cria OWNER do novo tenant.
- `GET /api/auth/me` retorna `{ user: { id, name, email, role, tenantId, tenant: { id, name, slug, plan, onboardingCompletedAt } } }`
  com `plan` lido do BANCO (não do JWT). Manter formato atual se já for parecido; se mudar, documentar aqui.
- `GET /api/users/colleagues` (qualquer usuário autenticado do tenant) → `[{ id, name, role, isOnline? }]`.

## Onboarding
- `GET /api/onboarding/progress` → `{ steps: { company: bool, whatsapp: bool, aiKey: bool, agent: bool, businessHours: bool }, completed: bool, completedAt: string|null }`
  (calculado do banco: tenant tem sessão CONNECTED, TenantApiKey ou chave global no env, Agent ativo, BusinessHours).
- `POST /api/onboarding/complete` e `POST /api/onboarding/skip` → gravam `Tenant.onboardingCompletedAt`.
- `GET /api/agents/templates` → modelos prontos `[{ key: 'loja'|'clinica'|'suporte'|'generico', name, description, systemPrompt, greeting? }]`.

## WhatsApp por agente
- `WhatsAppSession.agentId String?` (FK Agent, onDelete SetNull). `PATCH /api/whatsapp/:id` aceita `{ agentId }`.
- Conversa nova usa o agente da sessão; fallback = primeiro agente ativo.
- `POST /api/agents/:id/test` NÃO ativa o agente.

## Variáveis de ambiente (backend)
- `PUBLIC_URL` (ex.: `http://34.1.2.3` ou `https://atendia.duckdns.org`). Defaults derivados:
  `FRONTEND_URL = PUBLIC_URL`, `ALLOWED_ORIGINS = PUBLIC_URL`, `API_URL = PUBLIC_URL + '/api'`.
- `COOKIE_SECURE` = true somente se PUBLIC_URL começa com `https` (pode ser sobrescrito por env `COOKIE_SECURE=true|false`).
- `WHATSAPP_AUTH_DIR` (produção: `/app/data/whatsapp-auth`), `UPLOAD_DIR` (produção: `/app/data/uploads`) — respeitados em TODO o código.
- `TRUST_PROXY=1` (atrás do Caddy).
- Obrigatórias: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_ENCRYPTION_KEY` (64 hex).
- Opcionais: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `SMTP_HOST/PORT/SECURE/USER/PASS`, `EMAIL_FROM`,
  `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LOG_LEVEL`.

## Script de criação do admin (usado pelo instalador)
- Fonte: `packages/backend/src/scripts/create-admin.ts` → compilado para `packages/backend/dist/scripts/create-admin.js`.
- Execução no container: `docker compose exec -T backend node dist/scripts/create-admin.js`
  (WORKDIR do container = `/app/packages/backend`).
- Lê env: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` (default "Administrador"), `COMPANY_NAME` (default "Minha Empresa").
- Idempotente: cria (se não existir) tenant da plataforma `slug=plataforma` com plano ENTERPRISE + usuário SUPER_ADMIN,
  e um tenant da empresa `COMPANY_NAME` com o mesmo e-mail? NÃO — um e-mail = um usuário. Portanto: SUPER_ADMIN pertence ao
  tenant `COMPANY_NAME` (plano ENTERPRISE, ativo), e consegue usar o sistema normalmente E acessar /admin.
- Flag `--reset-password`: só atualiza a senha do usuário existente com ADMIN_EMAIL.
- Saída: exit 0 em sucesso; mensagens em português.
- Migrations rodam no start do container: `npx prisma migrate deploy` (falha = container não sobe).

## Git
- Agentes NÃO fazem commit, push, reset, checkout nem stash. Só editam arquivos do seu escopo.
- Scripts shell (`*.sh`, `install/atendia`) e `Caddyfile` devem ter finais de linha LF (`.gitattributes`).

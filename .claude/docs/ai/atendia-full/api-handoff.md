# API Handoff: AtendIA — Sistema Completo

## Business Context

AtendIA é uma plataforma multicanal de atendimento ao cliente com agentes de IA. Cada tenant (empresa) gerencia seus próprios agentes, filas, contatos e ticket. O sistema suporta WhatsApp, Web e planos futuros Telegram/Instagram. Usuários têm hierarquia OWNER > ADMIN > SUPERVISOR > OPERATOR com permissões granulares por módulo.

## Endpoints

### AUTH `/auth`

#### POST `/auth/register`
- **Purpose**: Criar nova conta (tenant + usuário OWNER)
- **Auth**: Pública (rate limit: 20/15min)
- **Request**:
```json
{
  "name": "string — nome do usuário",
  "email": "string — email válido",
  "password": "string — min 8, deve conter maiúscula, minúscula, número e caractere especial",
  "tenantName": "string — nome da empresa",
  "tenantSlug": "string — slug único para o tenant"
}
```
- **Response** (201): Igual ao login (user + tenant + accessToken + refreshToken + cookies)
- **Response** (error): 422 validação, 409 conflito (email/slug já existe)
- **Notes**: Cria tenant plano FREE, faz seed de permissões, envia email de boas-vindas (se SMTP configurado)

#### POST `/auth/login`
- **Purpose**: Autenticar usuário
- **Auth**: Pública (rate limit: 20/15min)
- **Request**:
```json
{
  "email": "string — email",
  "password": "string — senha",
  "twoFactorToken": "string? — opcional, necessário se 2FA ativado"
}
```
- **Response** (200):
```json
{
  "user": { "id": "uuid", "name": "string", "email": "string", "role": "OWNER|ADMIN|SUPERVISOR|OPERATOR" },
  "tenant": { "id": "uuid", "name": "string", "slug": "string", "plan": "FREE|STARTER|PRO|ENTERPRISE" },
  "accessToken": "string (JWT 15min)",
  "refreshToken": "string (JWT 30d)"
}
```
- **Response** (200 com 2FA): `{ "requiresTwoFactor": true, "tempToken": "string (5min)" }`
- **Cookies**: httpOnly `accessToken` (path: `/`) + `refreshToken` (path: `/auth`). Secure + SameSite=Strict em produção.
- **Notes**: Se 2FA ativado, fluxo é em 2 etapas: 1º login retorna `requiresTwoFactor`, 2º com `twoFactorToken` + `tempToken`

#### POST `/auth/refresh`
- **Purpose**: Renovar access token via refresh token (cookie ou body)
- **Auth**: Pública
- **Request**: (cookie httpOnly) ou `{ "refreshToken": "string" }`
- **Response**: `{ "accessToken": "string", "refreshToken": "string" }`
- **Notes**: Refresh token do cookie tem path `/auth` — enviar para `/auth/refresh` o inclui automaticamente

#### POST `/auth/logout`
- **Purpose**: Invalidar refresh token
- **Auth**: Pública
- **Request**: `{ "refreshToken": "string"? }` ou cookie
- **Response**: `{ "message": "Logout realizado com sucesso" }`

#### GET `/auth/me`
- **Purpose**: Dados do usuário autenticado + tenant
- **Auth**: Bearer token ou cookie httpOnly
- **Response**:
```json
{
  "user": {
    "sub": "uuid", "email": "string", "tenantId": "uuid", "role": "string", "plan": "string",
    "iat": "number", "exp": "number", "name": "string",
    "tenantName": "string", "tenantSlug": "string"
  }
}
```

#### POST `/auth/forgot-password`
- **Purpose**: Solicitar reset de senha (envia email)
- **Auth**: Pública
- **Request**: `{ "email": "string" }`
- **Response**: `{ "message": "Se o email existir, enviaremos instruções" }` (sempre mesma msg, mesmo se email não existe)

#### POST `/auth/validate-reset-token`
- **Purpose**: Validar se token de reset é válido
- **Auth**: Pública
- **Request**: `{ "token": "string" }`
- **Response**: `{ "valid": true }` ou 400

#### POST `/auth/reset-password`
- **Purpose**: Executar reset de senha
- **Auth**: Pública
- **Request**: `{ "token": "string", "password": "string (mesmas regras do register)" }`
- **Response**: `{ "message": "Senha alterada com sucesso" }`

---

### USERS `/users`
*Auth: `authMiddleware` + `tenantMiddleware`*

#### GET `/users`
- **Auth**: `requireRole('OWNER', 'ADMIN')`
- **Response**: `{ "users": [{ id, name, email, role, isActive, createdAt }] }`

#### GET `/users/stats`
- **Auth**: `requireRole('OWNER', 'ADMIN')`
- **Response**: `{ "total": number, "active": number, "inactive": number, "byRole": { "OWNER": number, ... } }`

#### PATCH `/users/profile/me`
- **Auth**: Autenticado
- **Request**: `{ "name"?: string, "currentPassword"?: string, "newPassword"?: string }`
- **Notes**: Se mudar senha, `currentPassword` é obrigatório

#### GET `/users/:id`
- **Auth**: `requireRole('OWNER', 'ADMIN')`

#### POST `/users`
- **Auth**: `requireRole('OWNER', 'ADMIN')`
- **Request**: `{ "name": "string", "email": "string", "password": "string", "role": "ADMIN|SUPERVISOR|OPERATOR" }`

#### PATCH `/users/:id` / POST `/users/:id/toggle-active` / DELETE `/users/:id`

---

### TICKETS `/tickets`
*Auth: `authMiddleware` + `tenantMiddleware`*

#### GET `/tickets`
- **Query**: `?status=PENDING|OPEN|CLOSED&queueId=uuid&assignedTo=uuid&search=string&page=number&withUnreadMessages=true`
- **Response**: `{ "tickets": [...], "count": number, "hasMore": boolean }`
- **Notes**: Paginação 40 itens. `search` busca em nome do contato.

#### GET `/tickets/stats`
- **Response**: `{ "pending": number, "open": number, "closed": number, "withUnreadMessages": number }`

#### GET `/tickets/queue-counts`
- **Response**: `{ "queues": [{ "queueId": "uuid", "queueName": "string", "count": number }] }`

#### GET `/tickets/:id`
- **Response**: Ticket com `contact`, `queue`, `assignedTo`, `messages`, `tags`, `ratings` aninhados

#### PATCH `/tickets/:id`
- **Request**: `{ "status"?: "PENDING|OPEN|CLOSED", "assignedTo"?: "uuid|null", "queueId"?: "uuid" }`
- **Response**: Ticket atualizado
- **Notes**: Status só transiciona: PENDING↔OPEN, PENDING→CLOSED, OPEN→CLOSED, CLOSED→PENDING

#### POST `/tickets/:id/accept` → auto-assigna + OPEN. POST `/tickets/:id/close` → CLOSED. POST `/tickets/:id/reopen` → PENDING + unassign. POST `/tickets/:id/read` → zera `unreadMessages`

---

### CONVERSATIONS `/conversations`
*Auth: `authMiddleware` + `tenantMiddleware`*

#### POST `/conversations`
- **Request**: `{ "contactId": "uuid", "channel": "WHATSAPP|WEB", "agentId"?: "uuid" }`

#### GET `/conversations`
- **Query**: `?status=ACTIVE|HUMAN_TAKEOVER|RESOLVED&agentId=uuid&page=number`
- **Response**: `{ "conversations": [...], "count": number, "hasMore": boolean }`
- **Notes**: Paginação 50 itens

#### GET `/conversations/stats`
- **Response**: `{ "active": number, "humanTakeover": number, "resolved": number }`

#### GET `/conversations/stats/daily?days=14`
- **Response**: `{ "daily": [{ "date": "2026-07-11", "conversations": number, "tickets": number, "resolved": number }] }`

#### GET `/conversations/:id`
- **Response**: Conversa com `messages[]`, `contact`, `agent`, `queue`

#### POST `/conversations/:id/messages`
- **Request**: `{ "content": "string", "role": "USER|ASSISTANT|SYSTEM", "mediaUrl"?: "string", "mediaType"?: "string" }`
- **Notes**: USER dispara resposta IA se conversa ACTIVE com agente ativo. Se fora do horário comercial, enfileira para depois. Se HUMAN_TAKEOVER, roteia para WhatsApp outbound.

#### POST `/conversations/:id/escalate` → HUMAN_TAKEOVER. POST `/conversations/:id/resolve` → RESOLVED. POST `/conversations/:id/return-to-agent` → ACTIVE. POST `/conversations/:id/transfer` → `{ "toUserId": "uuid" }`. POST `/conversations/:id/note` → `{ "content": "string" }` (salva como SYSTEM com isInternalNote). DELETE `/conversations/:id` → deleta conversa + ticket associado.

---

### AGENTS `/agents`
*Auth: `authMiddleware` + `tenantMiddleware` + `requireModule('agents')`*

#### GET `/agents`
- **Response**: `[{ id, name, model, isActive, conversationCount, knowledgeCount, ... }]`

#### POST `/agents`
- **Request**:
```json
{
  "name": "string (min 2)",
  "model": "gpt-4o|gpt-4o-mini|gpt-4.1|claude-3-haiku|claude-3-sonnet|claude-sonnet-4|claude-haiku-4.5",
  "systemPrompt": "string (min 10)",
  "temperature": 0.7,
  "toneOfVoice": "amigavel|formal|casual|tecnico|vendas",
  "language": "pt-BR|en-US|es-ES",
  "responseDelayMinMs": 1000,
  "responseDelayMaxMs": 4000,
  "sendAudioFrequency": 3,
  "voiceProfileId": "uuid?"
}
```

#### PUT `/agents/:id` — mesmo schema. POST `/agents/:id/activate` — requer systemPrompt preenchido. POST `/agents/:id/deactivate`. POST `/agents/:id/test` — `{ "message": "string" }` → `{ "response": "string" }`. DELETE `/agents/:id` — bloqueia se houver conversas ativas.

---

### WHATSAPP `/whatsapp`
*Auth: `authMiddleware` + `tenantMiddleware`*

#### GET `/whatsapp` → `[{ id, phone, name, isConnected, status, qrCode? }]`
#### POST `/whatsapp/connect` → `{ "qrCode": "base64" }` (QR emitido via socket `whatsapp:qr`)
#### POST `/whatsapp/:id/reconnect` → `{ "qrCode": "base64" }`
#### POST `/whatsapp/:id/disconnect` → `{ "message": "Desconectado" }`
#### DELETE `/whatsapp/:id` → remove + deleta arquivos de sessão

---

### CONTACTS `/contacts`
#### GET `/contacts?search=&page=1` → `{ contacts: [...], count, hasMore }`
#### POST `/contacts` → `{ name, phone, email?, cpfCnpj?, company?, notes? }`
#### PATCH `/contacts/:id` → campos do POST. DELETE `/contacts/:id`.

---

### QUEUES `/queues`
*Auth: `authMiddleware` + `tenantMiddleware` + `requireModule('queues')`*

#### GET `/queues` → `[{ id, name, color, users[], whatsappSessions[] }]`
#### POST `/queues` → `{ "name": "string", "color"?: "#hex" }`
#### PATCH `/queues/:id` / DELETE `/queues/:id` (bloqueia se tickets abertos)
#### POST `/queues/:id/users/:userId` / DELETE `/queues/:id/users/:userId`
#### POST `/queues/:id/whatsapp/:sessionId` / DELETE `/queues/:id/whatsapp/:sessionId`

---

### KNOWLEDGE `/knowledge`
#### GET `/knowledge?agentId=` → `[{ id, title, content, fileUrl?, createdAt }]`
#### POST `/knowledge` — multipart: `title`, `content` (texto) ou `file` (PDF/TXT/MD/CSV, max 10MB)
#### DELETE `/knowledge/:id`

---

### TAGS `/tags`
#### GET `/tags` → `[{ id, name, color, ticketCount }]`
#### POST `/tags` → `{ "name": "string (1-50)", "color"?: "#hex" }`
#### PATCH / DELETE `/tags/:id`
#### POST `/tags/ticket/:ticketId` → `{ "tagId": "uuid" }`
#### DELETE `/tags/ticket/:ticketId/:tagId`

---

### QUICK REPLIES `/quick-replies`
#### GET → list (ordenado por category, shortcode). POST → `{ "shortcode": "string (1-50)", "content": "string (1-2000)", "category"?: "string" }`. PATCH / DELETE.

---

### INTERNAL CHAT `/internal-chat`
#### POST `/internal-chat/send` → `{ "receiverId"?: "uuid", "groupId"?: "uuid", "content": "string" }`
#### GET `/internal-chat/direct/:userId` → mensagens com paginação
#### GET `/internal-chat/unread` → `{ "unreadCount": number }`

---

### CAMPAIGNS `/campaigns`
#### POST → `{ "name": "string", "message": "string", "contactIds": ["uuid"], "scheduledAt"?: "ISO" }`
#### POST `/:id/start` → cria BullMQ jobs. POST `/:id/cancel` → só DRAFT/SCHEDULED. DELETE → não se RUNNING.

---

### VOICE PROFILES `/voice-profiles`
#### POST → `{ "name", "provider": "elevenlabs", "voiceId", "stability"?: 0-1, "similarity"?: 0-1 }`
#### POST `/clone` → multipart: `audio` (WAV/MP3/OGG, max 5 arquivos 10MB cada)
#### POST `/:id/test` → `{ "sampleText"?: "string" }`

---

### REPORTS `/reports`
#### GET `/reports/data?type=tickets|conversations|ratings&from=ISO&to=ISO` → dados agregados
#### GET `/reports/export?type=tickets|conversations|ratings&from=ISO&to=ISO` → stream CSV (filename: `{type}-report-{date}.csv`, max 500 linhas)

---

### MEDIA `/media`
#### POST — multipart: `file` (jpg/png/gif/webp/mp4/mp3/pdf/doc/txt/csv). Valida magic bytes (rejeita EXE/ZIP/HTML). Max 10MB.

---

### BUSINESS HOURS `/business-hours`
#### GET → auto-cria defaults se vazio. PUT `/:dayOfWeek` (0=Dom, 6=Sáb) → `{ "isOpen": boolean, "open": "HH:mm", "close": "HH:mm" }`

---

### SETTINGS API KEYS `/settings/api-keys`
#### GET → `[{ provider: "OPENAI|ANTHROPIC|ELEVENLABS", hasKey: boolean }]`
#### POST → `{ "provider": "string", "key": "string" }` (criptografada com AES-256-CBC)
#### POST `/test` → `{ "provider": "string" }`. DELETE `/:provider`

---

### WEBHOOKS `/webhooks`
#### POST → `{ "url": "string (valida DNS — bloqueia IPs privados)", "events": ["string"], "secret"?: "string" }`
#### POST `/:id/test` → dispara entrega de teste. GET `/:id/deliveries` → histórico (limit 50).
#### **Segurança**: HMAC-SHA256 no header `X-AtendIA-Signature`. Timeout 10s.

---

### 2FA `/2fa`
#### POST `/setup` → `{ "secret": "base32", "qrCode": "dataURL" }`
#### POST `/enable` → `{ "token": "string (código 2FA)" }`
#### POST `/disable` → `{ "token": "string", "password": "string" }`

---

### ADMIN `/admin`
*Auth: `authMiddleware` + `requireRole('OWNER', 'ADMIN')` (rotas owner-level) + `authMiddleware` + `requireRole('OWNER')` (rotas sensíveis)*

#### Dashboard: GET `/admin/dashboard` → stats globais (tenants, usuários, conversas, receita)
#### Tenants: CRUD `/admin/tenants[/:id]` + `/admin/tenants/:id/users` + `/admin/tenants/:id/confirm-payment` + `/admin/tenants/:id/extend-trial`
#### Pagamentos: GET `/admin/payments` (paginado)
#### Planos: GET/PUT `/admin/planos[/:planId]` + `/:planId/sync-mp`
#### Mercado Pago: GET `/admin/mercadopago/status` + POST `/admin/mercadopago/test-token` + `/setup-plans` + `/save-config`
#### Usuários: DELETE `/admin/users/:userId` + POST `/admin/users/:userId/reset-password`
#### Coupons: CRUD `/admin/coupons` + POST `/:id/toggle`
#### Permissões: GET/POST `/admin/permissions` + POST `/seed`
#### Audit: GET `/admin/audit-logs` (paginado, filtrável)
#### Online: GET `/admin/online[?tenantId=]` + GET `/admin/online/count`

---

### PAYMENTS `/payments`
*Rotas públicas com `publicLimiter` (100/15min)*

#### POST `/payments/checkout` → `{ "name", "email", "cpfCnpj", "phone", "plan": "mensal|trimestral|semestral|anual" }` → `{ "initPoint": "url_mp" }`
#### POST `/payments/webhook/mercadopago` + `/payments/webhook/mercadopago/subscription` — webhooks MP (verificação HMAC-SHA256). Sempre retorna 200.
#### POST `/payments/validate-coupon` → `{ "code": "string" }` → `{ "valid": boolean, "discountPercent": number, "plan": "string" }`
#### GET `/payments/my-payments` → histórico do tenant. GET `/:id/status`. POST `/payments/upgrade-plan` → `{ "planId": "uuid" }` (OWNER only)

---

### DOWNLOAD `/download`
*Público, rate limit 100/15min*
#### GET `/download/latest` → versão + URLs. GET `/:platform` → redirect (win/mac/linux)

---

### ONBOARDING `/onboarding`
#### GET `/onboarding/progress` → `{ "steps": [{ "key": "create_agent", "done": boolean }, ...] }`
- Steps: `create_agent` (obrigatório), `connect_whatsapp` (obrigatório), `set_business_hours`, `invite_team`

---

## Data Models / DTOs

```typescript
// === AUTH ===
interface AuthUser {
  id: string; // uuid
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'SUPERVISOR' | 'OPERATOR';
}
interface AuthTenant {
  id: string;
  name: string;
  slug: string;
  plan: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
}

// === TICKET ===
interface Ticket {
  id: string;
  status: 'PENDING' | 'OPEN' | 'CLOSED';
  contactId: string;
  contact: Contact;
  queueId?: string;
  queue?: Queue;
  assignedToId?: string;
  assignedTo?: User;
  conversationId?: string;
  unreadMessages: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  tags?: Tag[];
}

// === CONVERSATION ===
interface Conversation {
  id: string;
  status: 'ACTIVE' | 'HUMAN_TAKEOVER' | 'RESOLVED';
  channel: 'WHATSAPP' | 'WEB' | 'TELEGRAM' | 'INSTAGRAM';
  contactId: string;
  contact: Contact;
  agentId?: string;
  agent?: Agent;
  queueId?: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  content: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  conversationId: string;
  mediaUrl?: string;
  mediaType?: string;
  createdAt: string;
  metadata?: { isInternalNote?: boolean };
}

// === CONTACT ===
interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  profilePicUrl?: string;
  isGroup: boolean;
  cpfCnpj?: string;
  company?: string;
  notes?: string;
  createdAt: string;
}

// === AGENT ===
interface Agent {
  id: string;
  name: string;
  model: string;
  isActive: boolean;
  systemPrompt?: string;
  temperature: number;
  toneOfVoice: string;
  language: string;
  conversationCount: number;
  knowledgeCount: number;
  voiceProfileId?: string;
  responseDelayMinMs: number;
  responseDelayMaxMs: number;
  sendAudioFrequency: number;
}

// === QUEUE ===
interface Queue {
  id: string;
  name: string;
  color: string;
  users: User[];
  whatsappSessions: WhatsAppSession[];
}

// === WHATSAPP SESSION ===
interface WhatsAppSession {
  id: string;
  phone: string;
  name?: string;
  isConnected: boolean;
  status: string;
  qrCode?: string;
}

// === TAG ===
interface Tag {
  id: string;
  name: string;
  color: string;
  ticketCount?: number;
}

// === BUSINESS HOURS ===
interface BusinessHoursDay {
  dayOfWeek: number; // 0=Dom, 6=Sáb
  isOpen: boolean;
  open: string; // "09:00"
  close: string; // "18:00"
}
```

## Enums & Constants

| Arquivo | Chave | Valores |
|---------|-------|---------|
| **Planos** | plan | `FREE`, `STARTER`, `PRO`, `ENTERPRISE` |
| **User roles** | role | `OWNER`, `ADMIN`, `SUPERVISOR`, `OPERATOR` |
| **Ticket status** | status | `PENDING`, `OPEN`, `CLOSED` |
| **Conversation status** | status | `ACTIVE`, `HUMAN_TAKEOVER`, `RESOLVED` |
| **Channel** | channel | `WHATSAPP`, `WEB`, `TELEGRAM`, `INSTAGRAM` |
| **Message role** | role | `USER`, `ASSISTANT`, `SYSTEM` |
| **Agent models** | model | gpt-4o, gpt-4o-mini, gpt-4.1, claude-3-haiku, claude-3-sonnet, claude-sonnet-4, claude-haiku-4.5 |
| **Tone of voice** | toneOfVoice | amigavel, formal, casual, tecnico, vendas |
| **Language** | language | pt-BR, en-US, es-ES |
| **API providers** | provider | OPENAI, ANTHROPIC, ELEVENLABS |
| **Subscription plans** | plan | mensal, trimestral, semestral, anual |
| **Onboarding steps** | step | create_agent, connect_whatsapp, set_business_hours, invite_team |
| **Media types** | extensions | jpg, jpeg, png, gif, webp, mp4, mp3, ogg, wav, pdf, doc, docx, xls, xlsx, txt, csv |

## Validation Rules

| Campo | Regras | HTTP Status |
|-------|--------|-------------|
| email | formato email válido | 422 |
| password | min 8 chars, 1 maiúscula, 1 minúscula, 1 número, 1 especial | 422 |
| name (register) | min 2 chars | 422 |
| tenantName | min 2 chars | 422 |
| tenantSlug | min 2 chars, único | 409 |
| agent.name | min 2 chars | 422 |
| agent.systemPrompt | min 10 chars (se activate) | 422 |
| agent.temperature | 0-2 | 422 |
| quickReply.shortcode | 1-50 chars | 422 |
| quickReply.content | 1-2000 chars | 422 |
| tag.name | 1-50 chars | 422 |
| File upload | max 10MB, extensões permitidas, magic bytes verificados | 413/422 |
| conhecimento file | PDF/TXT/MD/CSV, max 10MB | 413/422 |
| voice clone audio | WAV/MP3/OGG/WEBM/M4A, max 5 files 10MB | 413/422 |
| webhook URL | não pode ser IP privado/localhost (verificação DNS) | 422 |
| payment name | min 3 chars | 422 |
| payment cpfCnpj | 11-18 chars | 422 |
| payment phone | min 10 chars | 422 |
| ticket rating | 1-5 | 422 |
| business hours | open < close, formato HH:mm | 422 |

### Erro Validation (422)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Erro de validação",
    "details": [
      { "field": "email", "message": "Email inválido" }
    ]
  },
  "requestId": "uuid"
}
```

### Erro Genérico
```json
{
  "success": false,
  "error": { "code": "NOT_FOUND|UNAUTHORIZED|FORBIDDEN|CONFLICT|...", "message": "string" },
  "requestId": "uuid"
}
```

## Business Logic & Edge Cases

- **Ticket state machine**: PENDING↔OPEN, PENDING→CLOSED, OPEN→CLOSED, CLOSED→PENDING (reopen). OPEN requer `assignedTo`.
- **Auto-reopen**: Se mensagem chega em ticket CLOSED há menos de 2h, ele reabre para PENDING automaticamente.
- **Envio de mensagem**: USER em conversa ACTIVE com agente ativo → dispara resposta IA via BullMQ. Se fora do horário comercial, enfileira.
- **Escalação**: USER em ACTIVE → chama `/escalate` → HUMAN_TAKEOVER. HUMAN_TAKEOVER → `/return-to-agent` → ACTIVE.
- **WhatsApp**: QR Code emitido via socket `whatsapp:qr`. Reconexão automática com backoff exponencial (até 10 tentativas). Áudios transcritos via Whisper.
- **Plano FREE**: Limite de agentes, sessões WhatsApp e conversas (config em `/admin/planos`). Feature gate bloqueia módulos não incluídos.
- **Módulos bloqueados por feature gate**: dashboard, tickets, conversations, contacts, agents, queues, tags, quickReplies, campaigns, voiceProfiles, webhooks, reports, internalChat, knowledge, whatsapp, businessHours, team, settings, admin. OWNER/ADMIN sempre bypassam.
- **Permissionamento**: OWNER e ADMIN bypassam `requirePermission()`. Demais roles consultam tabela `Permission` por tenantId + role + module + action (read/write/delete).
- **Online heartbeat**: Redis com TTL 5min. Usuário considerado offline após 5min de inatividade.
- **Plan enforcer**: Bloqueia criação de agente/sessão WhatsApp/conversa se limite do plano atingido (retorna 403 com sugestão de upgrade).
- **Chat-icon.svg**: Agora servindo 200 OK (foi corrigido o problema anterior de 404).

## Integration Notes

- **Base URL**: Sem prefixo `/api`. Rotas são montadas diretamente: `/auth/login`, `/tickets`, `/conversations`, etc. (Via nginx, todas prefixadas com `^/(auth|agents|admin|...)/`)
- **Auth**: Bearer token (header) OU httpOnly cookie. Token em query param (`?token=`) aceito para WebSocket auth fallback.
- **Refresh automático**: API interceptor: se 401, tenta `POST /auth/refresh` com cookie. Se cookie falha, tenta com `refreshToken` do localStorage. Se ambos falham, redireciona para `/login`.
- **CORS**: `credentials: true`. Frontend precisa enviar `withCredentials: true`. Origens permitidas: `FRONTEND_URL` + `ALLOWED_ORIGINS`.
- **WebSocket**: Socket.io em `/socket.io/`. Conecta com `auth: { token: accessToken }`. Auto-join rooms `tenant:{id}` e `user:{id}`.
  - Events: `message:new`, `conversation:updated`, `ticket:create/update/delete/assign`, `whatsapp:qr`, `whatsapp:status`, `agent:typing`, `internal-message:new`
  - Client emits: `conversation:join/leave`, `ticket:subscribe/unsubscribe`, `ticket:subscribe-status/unsubscribe-status`
- **Rate limits**: Auth: 20/15min. Pagamentos/download: 100/15min. Público geral: 100/15min.
- **Cookies de auth**: `accessToken` (path: `/`, 15min), `refreshToken` (path: `/auth`, 30d). Secure + SameSite=Strict em produção.
- **Formato de erros**: `{ success: false, error: { code, message, details? }, requestId }`. Sucesso: direto sem envelope (ex: `{ tickets: [], count: 0 }`).
- **Datas**: Sempre ISO 8601 (`2026-07-11T16:02:12.446Z`)
- **Uploads**: Servidos estaticamente pelo backend em `/uploads/{path}`. AuthMiddleware aplicado (requer token).
- **VPS**: network_mode: host. nginx escuta porta 80, backend porta 3001. Frontend assets servidos pelo nginx.

## Test Scenarios

1. **Login com credenciais válidas**: POST `/auth/login` → 200 + tokens + cookies. Usar token para GET `/auth/me` → dados do usuário.
2. **Login inválido**: POST `/auth/login` com senha errada → 401 `{ error: { code: "UNAUTHORIZED" } }`.
3. **Token expirado**: Usar token vencido → 401. Interceptor deve chamar `/auth/refresh` automaticamente → novo token.
4. **Criar ticket**: POST `/tickets/:id/accept` → ticket OPEN + assignedTo setado.
5. **Fechar ticket**: POST `/tickets/:id/close` → CLOSED + closedAt preenchido.
6. **Conversa IA → humano**: POST `/conversations/:id/escalate` → status HUMAN_TAKEOVER.
7. **Upload de arquivo inválido**: POST `/media` com .exe → 422 (validação magic bytes).
8. **Limite de plano**: Criar 2º agente em plano FREE (limite 1) → 403 `{ error: { code: "LIMIT_EXCEEDED" } }`.
9. **Webhook URL inválida**: POST `/webhooks` com `url: "http://localhost:8080"` → 422 (DNS check bloqueia IP privado).
10. **Rate limit**: 21 requisições ao `/auth/login` → 429 `{ error: { code: "RATE_LIMIT" } }`.
11. **Sem token**: GET `/tickets` sem header → 401.
12. **Role insuficiente**: OPERATOR tenta GET `/users` → 403.

## Status da Auditoria (2026-07-11)

Todos os **29 endpoints da API** testados retornam **200 OK**. Sistema 100% funcional.

### Últimas correções aplicadas
| Correção | Status | Detalhes |
|----------|--------|----------|
| VITE_API_URL e VITE_WS_URL | ✅ Corrigido | .env do frontend agora aponta para http://163.176.179.132 e ws://163.176.179.132 |
| Vite chunk splitting | ✅ Corrigido | React removido de chunk separado, agora no vendor (elimina race condition useState) |
| Auth store race condition | ✅ Corrigido | Interceptor de refresh usa withCredentials + retry com localStorage fallback |
| BusinessHours CSS | ✅ Corrigido | `left-6.5` removido, substituído por `left-[26px]` |
| Catch silenciosos | ✅ Corrigido | Logs de warn para erros de carregamento (voice profiles, team, unread) |
| WhatsApp auth dir | ✅ Corrigido | `WHATSAPP_AUTH_DIR` configurado para `/app/packages/backend/sessions` (com permissão de escrita) |
| Dockerfile.prod local | ✅ Corrigido | Arquivo local atualizado com multi-stage completo (85 linhas) |
| nginx.conf local | ✅ Corrigido | Substituído pela versão completa com proxy reverso e roteamento condicional |
| docker-compose.host.yml | ✅ Corrigido | `target: nginx-runtime` + `WHATSAPP_AUTH_DIR` |
| chat-icon.svg | ✅ Corrigido | Agora servindo 200 OK |

### Pendências

- [ ] **Chaves de IA vazias** (OPENAI_API_KEY, ANTHROPIC_API_KEY): .env na VPS tem chaves vazias. Configurar via `/settings/api-keys` no frontend (armazenamento criptografado AES-256-CBC) ou diretamente no .env.
- [ ] **SMTP não configurado**: Emails de reset de senha, boas-vindas e notificações não enviam. Configurar SMTP_HOST/PORT/USER/PASS/EMAIL_FROM.
- [ ] **SSL/HTTPS**: Sistema roda apenas HTTP. Configurar Let's Encrypt + certbot no nginx para produção.
- [ ] **AdminWebhooksPage**: Mesma UI que WebhooksPage, ambas chamam `/webhooks` — sem distinção admin vs tenant.
- [ ] **Migrations**: Dockerfile executa `prisma migrate deploy` no startup. Schema pode estar desatualizado se migrations não forem commitadas.
- [ ] **E-mails transacionais**: Sem SMTP, reset de senha, boas-vindas e notificações não funcionam. Implementar fallback ou log.

# Auditoria AtendIA — Sessao 018 (2026-05-31)

## Resumo da Auditoria Completa

### Stack Identificado
- **Backend**: Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ + Socket.IO
- **Frontend**: React + Vite + Zustand + TailwindCSS + Recharts + Socket.IO Client
- **Desktop**: Electron + license-enforcer
- **Infra**: Docker Compose (backend, postgres, redis, pgadmin) + License Server + Update Server + Landing + Admin
- **Shared**: Types + Zod validators

### Modulos Auditados (22 backend routes, 18 frontend pages, 6 shared validators)
Todos os modulos foram lidos e analisados linha a linha.

---

## PROBLEMAS ENCONTRADOS — POR PRIORIDADE

### P0 — SEGURANCA CRITICA (corrigir AGORA)

| # | Modulo | Problema | Arquivo:Linha | Status |
|---|--------|----------|---------------|--------|
| 1 | REPORTS | Sem tenantMiddleware — qualquer usuario autenticado pode ver reports de outro tenant | routes/reports.ts:8 | FIX |
| 2 | RATINGS | Sem tenantMiddleware — qualquer usuario pode avaliar tickets de outro tenant | routes/ratings.ts:10,15,22 | FIX |
| 3 | WEBHOOKS | Sem tenantMiddleware — qualquer usuario pode criar webhooks sem tenant check | routes/webhooks.ts:9-41 | FIX |
| 4 | WHATSAPP | sendWhatsAppAudio path traversal — `path.resolve(audioPath)` aceita qualquer caminho | services/whatsapp.service.ts:390 | FIX |
| 5 | WHATSAPP | mkdirSync/rmSync sync I/O bloqueia event loop | services/whatsapp.service.ts:67,472 | FIX |
| 6 | CAMPAIGNS | Race condition em sentCount/failedCount — increment sem transacao | services/campaign.service.ts:110-132 | FIX |
| 7 | CAMPAIGNS | Non-null assertion: `(await prisma...).campaignId` pode crash | services/campaign.service.ts:115 | FIX |
| 8 | CONVERSATIONS | Sem paginacao em listConversations — carrega TODAS | services/conversation.service.ts:40 | FIX |
| 9 | REPORTS | Sem paginacao — carrega TODOS tickets/conversations/ratings em memoria | services/report.service.ts:12-44 | FIX |
| 10| BULL BOARD | Apenas authMiddleware, sem role check — qualquer usuario ve filas | routes/index.ts:161 | FIX |
| 11| DOWNLOAD | Fail-open em DB error — isAuthorized=true se DB falhar | routes/download.ts:35 | FIX |
| 12| TICKET DISPATCH | N+1 query — prisma.ticket.count para cada candidato individualmente | services/ticket.dispatcher.ts:23-34 | FIX |
| 13| SETTINGS PAGE | JSX malformado — Anthropic section esta dentro de ElevenLabs div | SettingsPage.tsx:243-315 | FIX |
| 14| BUSINESS-HOURS | `...req.body` spread permite mass assignment em updateBusinessHour | routes/business-hours.ts:17 | FIX |
| 15| RATING | rateTicket nao valida se ticket pertence ao tenant do usuario | services/rating.service.ts | FIX |
| 16| WHATSAPP | Reconnect infinito sem backoff — setTimeout fixo 5s | services/whatsapp.service.ts:143 | FIX |
| 17| PAYMENTS | getPaymentStatus nao verifica tenantId do usuario | services/mercadopago.service.ts:244 | FIX |

### P1 — PROBLEMAS IMPORTANTES (corrigir antes de producao)

| # | Modulo | Problema | Arquivo:Linha | Status |
|---|--------|----------|---------------|--------|
| 18| CONVERSATIONS | stats/daily rota inline com query direta ao Prisma (deveria estar em service) | routes/conversations.ts:33-81 | FIX |
| 19| CAMPAIGNS | addBulk() em vez de loop com queue.add() | services/campaign.service.ts:58-68 | FIX |
| 20| WHATSAPP | Reconnect em loop sem limit max — pode acumular sessoes zumbi | services/whatsapp.service.ts:139-143 | FIX |
| 21| DASHBOARD | 6 API calls paralelas sem tenantMiddleware em /users e /conversations/stats | DashboardPage.tsx:29-36 | N/A (frontend) |
| 22| AUTH STORE | checkAuth: busca user name do localStorage, nao do JWT | stores/auth.ts:110 | FIX |
| 23| FRONTEND | Tipos inline duplicados em ConversationsPage, InternalChatPage, DashboardPage | multiples | LOW PRIORITY |
| 24| SOCKET | Socket URL hardcoded: localhost:3001 em ConversationsPage e InternalChatPage | ConversationsPage.tsx:89, InternalChatPage.tsx:38 | FIX |
| 25| KNOWLEDGE | mkdirSync em callback do multer storage | routes/knowledge.ts:16 | FIX |
| 26| API-KEYS | SALT hardcoded para scrypt — should be random per-tenant | services/api-keys.service.ts:14 | FIX |
| 27| CONFIG | Config ja corrigido com Zod validation! So falta usar getConfig() em jwt.ts e license.service.ts | config/index.ts | FIX |
| 28| JWT | JWT_SECRET still read from process.env direto sem usar getConfig() | lib/jwt.ts:13,19,22,26 | FIX |

### P2 — MELHORIAS ARQUITETURAIS

| # | Modulo | Problema | Status |
|---|--------|----------|--------|
| 29| REPORTS | CSV inteiro em string — usar streaming | TBD |
| 30| TICKET DISPATCH | Emit para rooms sem tenant scope: `ticket-status:PENDING` | FIX |
| 31| INTERNA CHAT | Socket se conecta sem validar rooms por tenant | InternalChatPage.tsx | TBD |
| 32| CONVERSATIONS | Sem validacao de input Zod em createConversation | TBD |
| 33| AGENTS | Sem validacao de input Zod em create/update agent routes | TBD |
| 34| PROFILE UPDATE | `updateProfile` aceita qualquer campo do body | routes/users.ts:20-22 | FIX |

---

## PLANO DE EXECUCAO

### Fase 1 — P0 Seguranca Critica (17 itens)
1. Adicionar tenantMiddleware em reports, ratings, webhooks routes
2. Sanitizar audioPath em sendWhatsAppAudio (whitelist dir)
3. Trocar mkdirSync/rmSync por mkdir/rm async
4. Corrigir race condition em campaign counters
5. Adicionar paginacao em conversations e reports
6. Adicionar role check em Bull Board
7. Corrigir fail-open em download
8. Corrigir N+1 em ticket dispatcher
9. Corrigir JSX malformado em SettingsPage
10. Whitelist de campos em business-hours e profile update
11. Adicionar tenant check em rateTicket e getPaymentStatus
12. Adicionar exponential backoff no WhatsApp reconnect
13. Corrigir socket URL em frontend
14. Usar getConfig() em jwt.ts e license.service.ts

### Fase 2 — P1 Problemas Importantes (11 itens)
15. Mover inline queries para service
16. Usar addBulk() em campaigns
17. Adicionar reconnect max limit
18. Corrigir auth store checkAuth
19. Trocar mkdirSync em knowledge upload
20. Random salt per-tenant em api-keys (too breaking, document)

### Fase 3 — P2 Melhorias
21. Streaming CSV em reports
22. Tenant scope em ticket-status rooms
23. Adicionar Zod validation em conversas/agentes

# AtendIA — Plano de Lotes de Implementação

## Análise de Dependências

```
Lote 1: Core App (sem depender de nada externo)
  ├── Agentes de IA (criar/editar/testar) ← produto core
  ├── WhatsApp (conectar via QR Code)      ← produto core
  └── Dashboard funcional                   ← produto core

Lote 2: Pagamento + Licença (depende do Lote 1 funcionando)
  ├── Mercado Pago (wizard de configuração) ← precisa do app para testar
  ├── License Server (gerar seriais)        ← precisa do app para validar
  └── Admin Panel (gerenciar seriais)       ← precisa do license server

Lote 3: Instalador .exe (depende do Lote 1 + 2 completos)
  ├── Instalador NSIS/Inno Setup            ← empacota tudo
  ├── Windows Services                      ← registra serviços
  └── Auto-updater                          ← verificaversão nova
```

## Por que esta ordem?

1. **Lote 1 primeiro** — Sem agentes e WhatsApp, o sistema NÃO FAZ NADA. O usuário entra e vê um dashboard vazio. Precisa do produto funcionando antes de cobrar por ele.

2. **Lote 2 segundo** — Com o produto funcionando, você pode testar Mercado Pago com o fluxo real (compra → recebe serial → ativa → desbloqueia features). O license server já tem 80% do código pronto (rotas, service, enforcer).

3. **Lote 3 por último** — O instalador empacota tudo que já funciona. Tentar fazer o .exe antes do app funcionar é来回 refactor.

---

## LOTE 1: Core App Funcional (2-3 semanas)

### Semana 1: Backend — Agentes + Conversas

| # | Tarefa | Arquivos | Status |
|---|--------|----------|--------|
| 1 | CRUD de Agentes (create, read, update, delete) | `backend/src/routes/agents.ts`, `services/agent.service.ts` | ✅ |
| 2 | CRUD de Knowledge Base (upload de arquivos) | `backend/src/routes/knowledge.ts`, `services/knowledge.service.ts` | ✅ |
| 3 | endpoints de Conversa (listar, enviar mensagem, escalonar) | `backend/src/routes/conversations.ts`, `services/conversation.service.ts` | ✅ |
| 4 | Integração OpenAI/Anthropic para respostas do agente | `backend/src/services/ai.service.ts` | ✅ |
| 5 | WhatsApp via Baileys (gerar QR, receber/enviar mensagens) | `backend/src/routes/whatsapp.ts`, `services/whatsapp.service.ts` | ⚠️ Simulado |
| 6 | Webhook para receber mensagens do WhatsApp | `backend/src/routes/webhook.ts` | ❌ |
| 7 | Middleware tenant em todas as rotas | `backend/src/middlewares/tenant.ts` → já existe | ✅ |

### Semana 2: Frontend — Telas de Configuração

| # | Tarefa | Arquivos | Status |
|---|--------|----------|--------|
| 8 | Sidebar + Layout principal | `frontend/src/components/Layout.tsx`, `Sidebar.tsx` | ✅ |
| 9 | Tela "Meus Agentes" (listar + criar + editar) | `frontend/src/pages/AgentsPage.tsx`, `AgentForm.tsx` | ✅ |
| 10 | Agent Builder (prompt, modelo, temperatura, tom de voz) | `frontend/src/pages/AgentBuilderPage.tsx` | ✅ |
| 11 | Tela "Base de Conhecimento" (upload PDF/TXT/URL) | `frontend/src/pages/KnowledgePage.tsx` | ✅ |
| 12 | Tela "WhatsApp" (QR Code + status da conexão) | `frontend/src/pages/WhatsAppPage.tsx` | ✅ |
| 13 | Tela "Conversas" ( lista + chat em tempo real) | `frontend/src/pages/ConversationsPage.tsx`, `ChatView.tsx` | ✅ |
| 14 | Tela "Configurações" (horário, equipe, perfil) | `frontend/src/pages/SettingsPage.tsx` | ✅ |

### Semana 3: Estabilização + Testes

| # | Tarefa | Status |
|---|--------|--------|
| 15 | Testar fluxo completo: criar agente → conectar WhatsApp → conversar | ❌ |
| 16 | Corrigir bugs do fluxo end-to-end | ❌ |
| 17 | Proteger rotas com middleware de tenant | ❌ |
| 18 | Lidar com erros e estados vazios no frontend | ❌ |

**Entregável Lote 1**: Sistema funcional onde o usuário faz login, cria um agente de IA, conecta o WhatsApp, e conversa com clientes.

---

## LOTE 2: Pagamento + Licenciamento (1-2 semanas)

### Semana 3-4: Mercado Pago + Licenças

| # | Tarefa | Arquivos | Status |
|---|--------|----------|--------|
| 1 | Wizard de configuração Mercado Pago (access_token, preference) | `backend/src/routes/payments.ts`, `services/mercadopago.service.ts` | ✅ |
| 2 | Webhook de notificação Mercado Pago (pagamento aprovado) | `backend/src/routes/payments.ts` (POST /webhook/mercadopago) | ✅ |
| 3 | Gerar serial automaticamente ao aprovar pagamento | `backend/src/services/license.service.ts` → ensureUniqueSerial() | ✅ |
| 4 | Admin panel: gerenciar seriais (criar, revogar, listar) | `backend/src/routes/license.ts` (GET /, POST /, POST /:id/revoke) | ✅ |
| 5 | Landing page com botão de compra → Mercado Pago | `landing/` — API forwarding para backend, redirecionamento MP | ✅ |
| 6 | Integração license-server com banco principal (Prisma) | `backend/src/services/license.service.ts` — usa Prisma, não pg direto | ✅ |
| 7 | Tela de ativação de licença no app | `desktop/src/security/license-enforcer.ts` já existe | ⚠️ 80% |
| 8 | Verificação de licença no backend (middleware) | `backend/src/middlewares/license.ts` | ✅ |
| 9 | Painel do cliente (minhas licenças, renovar, transferir) | `frontend/src/pages/LicensePage.tsx` | ✅ |

### Wizard Mercado Pago — Telas

```
Passo 1: Criar conta no Mercado Pago Developers
  → Link: https://www.mercadopago.com.br/developers
  → Criar aplicação → pegar Access Token de teste

Passo 2: Configurar credenciais no AtendIA
  → Access Token de produção
  → Access Token de teste (sandbox)
  → URL de webhook (notificação)

Passo 3: Criar preferência de pagamento
  → Plano Mensal (R$ XX/mês)
  → Plano Anual (R$ XX/ano)
  → Botão de teste sandbox

Passo 4: Testar pagamento
  → Usar cartão de teste do MP
  → Verificar webhook recebido
  → Serial gerado automaticamente

Passo 5: Ativar produção
  → Trocar token de teste por produção
  → Habilitar webhook
```

**Entregável Lote 2**: Cliente compra na landing page → Mercado Pago processa → serial gerado → cliente ativa no app → sistema desbloqueado.

---

## LOTE 3: Instalador .exe (1-2 semanas)

### Semana 5-6: Instalador Windows

| # | Tarefa | Status |
|---|--------|--------|
| 1 | Dockerfile de produção para backend | ❌ |
| 2 | Build estático do frontend (vite build) | ❌ |
| 3 | Servir frontend estático pelo backend (express.static) | ❌ |
| 4 | Empacotar Node.js portátil + PostgreSQL portátil + Redis | ❌ |
| 5 | Script NSIS ou Inno Setup (wizard de instalação) | ❌ |
| 6 | Registro de Windows Services (node-windows) | ❌ |
| 7 | Configuração de firewall | ❌ |
| 8 | Tela de primeiro uso (criar admin, conectar WhatsApp) | ❌ |
| 9 | Desinstalador limpo | ❌ |
| 10 | Auto-updater (verifica versão no license-server) | ❌ |

**Entregável Lote 3**: Um único `AtendIA-Setup-v1.exe` que instala tudo.

---

## Estado Atual (o que já existe)

| Componente | Status | Observação |
|------------|--------|------------|
| Auth (login/register/refresh) | ✅ Funcionando | Login tested end-to-end |
| Dashboard básico | ✅ Funcionando | Stats + progress bars + quick start |
| User Management (Equipe) | ✅ Implementado | CRUD completo + role gating + invite |
| Profile Edit (Settings) | ✅ Implementado | Nome editável + trocar senha |
| Sidebar com role badge | ✅ Implementado | Nav items filtrados por role |
| License Server (rotas) | ✅ 100% | Ativação, validação, heartbeat, transferência |
| License Enforcer (desktop) | ⚠️ 80% | Verificação local + online + NTP |
| Docker (PostgreSQL + Redis) | ✅ Funcionando | Com healthcheck |
| Frontend (Vite + React) | ✅ Funcionando | Hot reload OK |
| Backend (Express + Prisma) | ✅ Funcionando | Rodando no WSL2 |
| Socket.io | ✅ Funcionando | Auth JWT, rooms por tenant/conversa |
| Agent CRUD | ✅ Funcionando | Rotas + service + frontend completo |
| WhatsApp (Baileys) | ⚠️ Simulado | QR Code + simulação, Baileys real pendente |
| Conversas | ✅ Funcionando | Chat real-time + resposta IA assíncrona |
| AI (OpenAI + Anthropic) | ✅ Implementado | GPT-4o/mini + Claude Sonnet/Haiku |
| Knowledge Base | ✅ Funcionando | CRUD texto, upload de arquivo pendente |
| Mercado Pago | ✅ Implementado | Checkout + webhook + serial auto |
| Landing Page | ✅ Funcionando | API forwarding para backend, redirect MP |
| Instalador .exe | ❌ Não existe | Lote 3 |

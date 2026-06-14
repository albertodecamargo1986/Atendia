# AtendIA — Arquitetura Técnica

---

## Stack Tecnológica

### Backend
| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | 20 LTS | Runtime principal |
| Express | 4.x | Framework HTTP / API REST |
| Socket.io | 4.x | Comunicação em tempo real (WebSockets) |
| PostgreSQL | 15 | Banco de dados principal |
| Redis | 7 | Filas de mensagens, sessões, cache |
| BullMQ | 4.x | Gerenciamento de filas sobre Redis |
| Baileys | latest | Conexão WhatsApp Web sem API oficial |
| OpenAI SDK | 4.x | Agente de IA (GPT-4o / GPT-4o-mini) |
| Anthropic SDK | 0.x | Alternativa: Claude como agente |
| Prisma | 5.x | ORM e migrations |
| JWT | 9.x | Autenticação stateless |
| Docker | 24 | Containerização |

### Frontend
| Tecnologia | Versão | Uso |
|---|---|---|
| React | 18 | Interface web |
| TypeScript | 5 | Tipagem estática |
| Vite | 5 | Build tool |
| TailwindCSS | 3 | Estilização |
| shadcn/ui | latest | Componentes de UI |
| Zustand | 4 | Gerenciamento de estado |
| React Query | 5 | Cache e sincronização de dados |
| Socket.io Client | 4.x | Conexão WebSocket |
| React Hook Form | 7 | Formulários |
| Zod | 3 | Validação de schemas |
| Recharts | 2.x | Gráficos e dashboards |

### Desktop (adicional ao core)
| Tecnologia | Versão | Uso |
|---|---|---|
| Electron | 30 | Empacotamento desktop |
| electron-builder | 24 | Build e distribuição |
| electron-updater | 6 | Auto-update |
| better-sqlite3 | 9 | SQLite local |
| electron-store | 8 | Configurações persistentes |

---

## Fluxo de Mensagens — Diagrama ASCII

```
CLIENTE WHATSAPP
      │
      │ mensagem
      ▼
┌─────────────────┐
│  Baileys Session │  ◄──── QR Code autenticado pelo Admin
│  (WhatsApp Web) │
└────────┬────────┘
         │ evento onMessage
         ▼
┌─────────────────┐
│   Message Queue  │  ◄──── Redis / BullMQ
│   (Bull Worker)  │        (garante ordem e reprocessamento)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│           Chat Engine (Node.js)          │
│                                         │
│  1. Identifica conversa (nova ou ativa) │
│  2. Verifica estado: IA ou Humano?      │
│  3. Persiste mensagem no PostgreSQL     │
│  4. Emite evento Socket.io p/ frontend  │
└────────┬──────────────────┬────────────┘
         │ estado = IA       │ estado = Humano
         ▼                   ▼
┌────────────────┐  ┌────────────────────┐
│  AI Agent      │  │  Operator Panel    │
│  (OpenAI/      │  │  (React Frontend)  │
│   Anthropic)   │  │  Notificação       │
│                │  │  em tempo real     │
│  Contexto:     │  └────────────────────┘
│  - Histórico   │
│  - Persona     │
│  - Knowledge   │
│    Base        │
└────────┬───────┘
         │ resposta gerada
         ▼
┌─────────────────┐
│  Send Message   │
│  via Baileys    │
└────────┬────────┘
         │
         ▼
CLIENTE WHATSAPP recebe resposta
```

---

## Arquitetura Multi-Tenant (SaaS)

Cada empresa (tenant) que se cadastra na plataforma recebe:

- Um `company_id` único (UUID)
- Todos os registros no banco incluem `company_id` como chave de isolamento
- Middleware de autenticação injeta `company_id` em cada request
- Impossível acessar dados de outro tenant via API

```
Request HTTP
    │
    ▼
┌─────────────────────────┐
│  Auth Middleware         │
│  - Valida JWT            │
│  - Extrai company_id     │
│  - Injeta em req.tenant  │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Controller              │
│  - Usa req.tenant.id     │
│    em todas as queries   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  PostgreSQL              │
│  WHERE company_id = ?    │
└─────────────────────────┘
```

**Estratégia de isolamento:** Row-Level Security (RLS) no PostgreSQL como segunda camada de proteção, além do isolamento na aplicação.

---

## Sistema de Filas (BullMQ + Redis)

```
Filas existentes:
├── message-incoming     → processa mensagens recebidas
├── message-outgoing     → envia mensagens para WhatsApp
├── ai-processing        → chama API de IA (com rate limiting)
├── notification         → envia notificações (e-mail, push)
├── whatsapp-session     → gerencia reconexões de sessão
└── license-check        → verifica validade de licenças
```

Cada fila tem:
- **Retry automático** com backoff exponencial (3 tentativas)
- **Dead Letter Queue** para mensagens que falharam todas as tentativas
- **Prioridade configurável** (mensagens de clientes VIP têm prioridade maior)
- **Concorrência controlada** (máximo de workers simultâneos por fila)

---

## Estrutura do Banco de Dados

### Entidades Principais

```sql
-- Empresas (Tenants)
companies
├── id (UUID, PK)
├── name
├── slug (único, usado na URL)
├── plan (free|starter|pro|enterprise)
├── plan_expires_at
├── settings (JSONB)
└── created_at

-- Usuários
users
├── id (UUID, PK)
├── company_id (FK → companies)
├── name
├── email (único por empresa)
├── password_hash
├── role (super_admin|admin|supervisor|operator|agent_configurator)
├── is_active
└── created_at

-- Agentes de IA
agents
├── id (UUID, PK)
├── company_id (FK)
├── name
├── persona (TEXT — prompt de personalidade)
├── tone (formal|informal|technical|friendly)
├── knowledge_base (JSONB — fontes de conhecimento)
├── escalation_rules (JSONB)
├── schedule (JSONB — horários de atendimento)
├── is_active
└── updated_at

-- Sessões WhatsApp
whatsapp_sessions
├── id (UUID, PK)
├── company_id (FK)
├── phone_number
├── status (disconnected|connecting|connected|banned)
├── session_data (ENCRYPTED TEXT — credenciais Baileys)
├── qr_code (TEXT — atual para conexão)
└── last_seen_at

-- Conversas
conversations
├── id (UUID, PK)
├── company_id (FK)
├── whatsapp_session_id (FK)
├── contact_phone
├── contact_name
├── status (waiting|ai_handling|human_handling|resolved|abandoned)
├── assigned_operator_id (FK → users, nullable)
├── agent_id (FK → agents)
├── tags (TEXT[])
├── notes (TEXT)
├── started_at
└── resolved_at

-- Mensagens
messages
├── id (UUID, PK)
├── conversation_id (FK)
├── direction (inbound|outbound)
├── sender_type (customer|ai|human|system)
├── sender_id (nullable — user_id se humano)
├── type (text|image|audio|document|location|sticker|reaction)
├── content (TEXT)
├── media_url (nullable)
├── whatsapp_message_id (para rastreio de status)
├── status (sent|delivered|read|failed)
└── created_at

-- Licenças (Desktop)
licenses
├── id (UUID, PK)
├── serial (único, formato ATND-XXXX-XXXX-XXXX-XXXX)
├── customer_email
├── customer_name
├── plan (monthly|quarterly|semiannual|annual)
├── expires_at
├── hwid (hardware ID da máquina ativada)
├── activated_at
├── transfers_used (default 0, máx 2/ano)
├── is_active
└── created_at
```

---

## Widget Embedável

O widget pode ser incorporado em qualquer sistema via:

### Método 1 — Script Tag (recomendado)
```html
<script>
  window.AtendIA = { apiKey: 'sua-api-key', agentId: 'agent-uuid' };
</script>
<script src="https://cdn.atend-ia.com/widget/v1/chat.js" async></script>
```

### Método 2 — iFrame
```html
<iframe
  src="https://app.atend-ia.com/widget/AGENT_ID?theme=light"
  width="400"
  height="600"
  frameborder="0">
</iframe>
```

O widget se comunica com a plataforma via API REST e WebSocket, usando a API Key do tenant para autenticação. Suporta personalização de cores, logo, mensagem de abertura e idioma via parâmetros.

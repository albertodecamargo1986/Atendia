# Módulo 03 — Motor de Chat (Chat Engine)

---

## Visão Geral

O Chat Engine é o núcleo do AtendIA. Gerencia todo o fluxo de mensagens em tempo real, desde o recebimento de uma mensagem do cliente até a entrega da resposta, passando pelo processamento da IA ou roteamento para um operador humano.

---

## Arquitetura Socket.io

### Namespaces
```
/operators    → conexões dos operadores humanos (dashboard de atendimento)
/supervisors  → conexões dos supervisores (visão geral)
/widget       → conexões do widget embedável no site do cliente
```

### Rooms (Salas)
Cada entidade tem sua própria room Socket.io:
```
company:{company_id}            → todos os eventos da empresa
conversation:{conversation_id}  → eventos de uma conversa específica
operator:{user_id}              → eventos privados de um operador
```

### Autenticação WebSocket
```javascript
// Cliente envia JWT no handshake
io.connect('/operators', {
  auth: { token: 'Bearer eyJ...' }
});

// Servidor valida no middleware
io.of('/operators').use((socket, next) => {
  const token = socket.handshake.auth.token;
  const payload = verifyJWT(token);
  socket.data.user = payload;
  socket.join(`company:${payload.company_id}`);
  next();
});
```

---

## Eventos Socket.io

### Emitidos pelo Servidor (server → client)
```typescript
// Nova mensagem em uma conversa
'message:new' → { conversationId, message: Message }

// Status de mensagem atualizado
'message:status' → { messageId, status: 'sent'|'delivered'|'read' }

// Conversa criada ou atualizada
'conversation:new' → { conversation: Conversation }
'conversation:update' → { conversationId, changes: Partial<Conversation> }

// Operador digitando (para supervisor)
'operator:typing' → { operatorId, conversationId, isTyping: boolean }

// IA digitando (para operador ver)
'ai:typing' → { conversationId, isTyping: boolean }

// Notificação de escalação
'escalation:alert' → { conversationId, reason: string, urgency: 'low'|'medium'|'high' }

// Takeover realizado
'takeover:started' → { conversationId, operator: User }
'takeover:ended'   → { conversationId }

// Contagem de fila atualizada
'queue:update' → { waitingCount: number, activeCount: number }
```

### Emitidos pelo Cliente (client → server)
```typescript
// Operador digita
'operator:typing' → { conversationId, isTyping: boolean }

// Operador assume conversa
'takeover:request' → { conversationId }

// Operador encerra conversa
'conversation:resolve' → { conversationId, resolution: string }

// Operador leu mensagens
'messages:read' → { conversationId }
```

---

## Sistema de Filas (BullMQ + Redis)

### Fila: message-incoming
Processa cada mensagem recebida de qualquer canal.

```typescript
interface IncomingMessageJob {
  channel: 'whatsapp' | 'web_widget' | 'instagram' | 'telegram';
  companyId: string;
  sessionId: string;
  rawMessage: any; // formato bruto do canal
}

// Worker
async function processIncoming(job: Job<IncomingMessageJob>) {
  const message = normalizeMessage(job.data);      // normaliza para formato interno
  const conversation = await findOrCreateConversation(message);
  const savedMessage = await saveMessage(message, conversation.id);
  
  await emitToOperators(conversation.companyId, 'message:new', { ... });
  
  if (conversation.status === 'ai_handling') {
    await aiQueue.add('process', { conversationId: conversation.id, messageId: savedMessage.id });
  }
}
```

### Fila: ai-processing
Chama a API de IA com controle de rate limiting.

```typescript
interface AIProcessingJob {
  conversationId: string;
  messageId: string;
}

// Configuração da fila
const aiQueue = new Queue('ai-processing', {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
  },
  limiter: {
    max: 10,        // máximo 10 jobs simultâneos (controle de custo)
    duration: 1000, // por segundo
  }
});
```

---

## Estados de uma Conversa

```
                 ┌─────────────┐
                 │   WAITING   │ ← nova conversa, aguardando na fila
                 └──────┬──────┘
                        │
           ┌────────────┴────────────┐
           ▼                         ▼
  ┌─────────────────┐     ┌─────────────────────┐
  │  AI_HANDLING    │     │   HUMAN_HANDLING     │
  │ (agente de IA)  │◄────►   (operador humano)  │
  └────────┬────────┘     └──────────┬──────────┘
           │                          │
           └──────────┬───────────────┘
                      │
            ┌─────────┴──────────┐
            ▼                    ▼
       ┌──────────┐        ┌──────────┐
       │ RESOLVED │        │ ABANDONED│
       └──────────┘        └──────────┘
```

Transições:
- `waiting → ai_handling`: agente disponível e dentro do horário
- `waiting → human_handling`: sem agente configurado, ou fora do horário
- `ai_handling → human_handling`: escalação (regras do agente)
- `human_handling → ai_handling`: operador devolve para o agente
- `* → resolved`: operador ou sistema encerra a conversa
- `* → abandoned`: cliente some por mais de 24h sem resolução

---

## Tipos de Mensagem Suportados

```typescript
type MessageType =
  | 'text'       // texto simples
  | 'image'      // imagem (jpg, png, gif, webp)
  | 'audio'      // áudio (ogg, mp4, mp3)
  | 'video'      // vídeo (mp4)
  | 'document'   // documento (pdf, docx, xlsx, etc)
  | 'location'   // latitude + longitude
  | 'sticker'    // figurinha
  | 'reaction'   // reação a mensagem
  | 'template'   // mensagem template (WhatsApp Business)
  | 'system'     // mensagem interna do sistema (ex: "Conversa assumida por João")

interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  senderType: 'customer' | 'ai' | 'human' | 'system';
  senderId?: string;     // user_id se humano
  type: MessageType;
  content?: string;      // texto
  mediaUrl?: string;     // URL do arquivo de mídia
  mediaType?: string;    // MIME type
  location?: { lat: number; lng: number; name?: string };
  reactedToMessageId?: string;
  reactionEmoji?: string;
  whatsappMessageId?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: Date;
}
```

---

## Funcionalidades de UX

### Indicador "Digitando..."
```typescript
// Operador começa a digitar
socket.emit('operator:typing', { conversationId, isTyping: true });
// Servidor repassa para o canal (ex: WhatsApp via Baileys)
// e para outros operadores/supervisores que estão na mesma conversa

// Auto-stop após 5 segundos sem nova tecla pressionada
// (debounce no frontend)
```

### Notificações Sonoras e Visuais
- **Nova mensagem:** som + badge no título da aba + notificação push (se permitido)
- **Nova conversa na fila:** som mais chamativo + destaque visual na lista
- **Escalação urgente:** som de alerta + modal de destaque
- Sons configuráveis por operador (volume, tipo de som ou silenciar)

### Distribuição Automática de Conversas
```typescript
async function assignConversation(conversationId: string, companyId: string) {
  // Busca operadores disponíveis ordenados por menor carga
  const operator = await prisma.user.findFirst({
    where: {
      company_id: companyId,
      role: { in: ['operator', 'supervisor', 'admin'] },
      is_active: true,
      status: 'available', // campo de presença
    },
    orderBy: {
      activeConversationsCount: 'asc', // menor número de conversas ativas
    },
  });

  if (operator) {
    await assignToOperator(conversationId, operator.id);
  } else {
    // Mantém na fila, notifica supervisores
    await notifySupervisors(companyId, 'queue:waiting', { conversationId });
  }
}
```

---

## Persistência e Histórico

- Todas as mensagens são salvas **permanentemente** no PostgreSQL
- Nenhuma mensagem é deletada (soft delete apenas para notas internas)
- Histórico acessível pelos operadores na interface de atendimento
- Busca full-text nas mensagens usando `tsvector` do PostgreSQL
- Exportação de histórico por conversa em PDF ou JSON

---

## Endpoints REST

```
GET    /conversations                     → listar conversas (com filtros)
GET    /conversations/:id                 → detalhes de uma conversa
GET    /conversations/:id/messages        → mensagens de uma conversa
POST   /conversations/:id/messages        → enviar mensagem (operador)
PUT    /conversations/:id/status          → atualizar status
POST   /conversations/:id/assign          → atribuir a operador
POST   /conversations/:id/resolve         → encerrar conversa
GET    /conversations/:id/notes           → notas internas
POST   /conversations/:id/notes           → criar nota interna
DELETE /conversations/:id/notes/:noteId   → deletar nota
```

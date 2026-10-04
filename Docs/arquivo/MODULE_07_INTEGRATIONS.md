# Módulo 07 — Integrações e Widget Embedável

---

## API REST Pública

### Autenticação
Todas as requisições à API pública usam **API Key** no header:
```
X-API-Key: atnd_live_xxxxxxxxxxxxxxxxxxxx
```

API Keys são geradas no painel de Configurações → Integrações → API Keys. Cada key pode ter permissões específicas (somente leitura, escrita, webhooks).

### Versionamento
URL base: `https://api.atend-ia.com/v1/`
Versão atual: `v1` — mudanças breaking são lançadas em nova versão com período de deprecação de 6 meses.

### Rate Limiting
| Plano | Requisições/minuto |
|---|---|
| Free | 60 |
| Starter | 300 |
| Pro | 1.000 |
| Enterprise | 10.000 |

Headers de resposta: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Endpoints Principais

```
# Conversas
GET    /v1/conversations                  → listar conversas
GET    /v1/conversations/:id              → detalhes de uma conversa
POST   /v1/conversations                  → criar conversa
PUT    /v1/conversations/:id              → atualizar conversa
GET    /v1/conversations/:id/messages     → mensagens de uma conversa
POST   /v1/conversations/:id/messages     → enviar mensagem

# Contatos
GET    /v1/contacts                       → listar contatos
GET    /v1/contacts/:id                   → detalhes de um contato
PUT    /v1/contacts/:id                   → atualizar contato

# Agentes
GET    /v1/agents                         → listar agentes
GET    /v1/agents/:id                     → detalhes de um agente

# Webhooks
GET    /v1/webhooks                       → listar webhooks
POST   /v1/webhooks                       → criar webhook
PUT    /v1/webhooks/:id                   → atualizar webhook
DELETE /v1/webhooks/:id                   → deletar webhook
POST   /v1/webhooks/:id/test              → testar webhook
```

---

## Webhooks

### Configuração
No painel: Configurações → Integrações → Webhooks → "Adicionar webhook"
- URL de destino (HTTPS obrigatório)
- Eventos a escutar (multiselect)
- Secret para validação de assinatura

### Eventos Disponíveis

| Evento | Descrição | Quando dispara |
|---|---|---|
| `conversation.created` | Nova conversa iniciada | Cliente envia 1ª mensagem |
| `conversation.updated` | Status de conversa mudou | Takeover, resolução, etc. |
| `conversation.resolved` | Conversa encerrada | Operador encerra |
| `message.received` | Nova mensagem do cliente | A cada mensagem recebida |
| `message.sent` | Mensagem enviada (IA ou humano) | A cada mensagem enviada |
| `escalation.created` | Agente escalonou para humano | Regras de escalação ativadas |
| `takeover.started` | Operador assumiu conversa | Botão de assumir clicado |
| `csat.received` | Cliente respondeu pesquisa de satisfação | Resposta do CSAT |

### Formato do Payload
```json
{
  "event": "conversation.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "company_id": "uuid",
  "data": {
    "conversation": {
      "id": "uuid",
      "contact_phone": "+5511999998888",
      "contact_name": "João Silva",
      "channel": "whatsapp",
      "status": "ai_handling",
      "created_at": "2024-01-15T10:30:00Z"
    }
  }
}
```

### Validação da Assinatura
Cada webhook inclui o header `X-AtendIA-Signature` com HMAC-SHA256 do payload usando o secret configurado:
```typescript
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');

// Receptor deve validar:
const expectedSig = `sha256=${signature}`;
const receivedSig = req.headers['x-atend-ia-signature'];
if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(receivedSig))) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

### Retry de Webhooks
- 5 tentativas com backoff exponencial (30s, 1min, 5min, 30min, 2h)
- Webhook marcado como inativo após 5 falhas consecutivas
- Dashboard mostra histórico de deliveries e erros

---

## Widget Embedável

### Instalação — Uma Linha de Código
```html
<script src="https://cdn.atend-ia.com/widget/v1/chat.js"
        data-api-key="atnd_live_xxx"
        data-agent-id="agent-uuid"
        async>
</script>
```

### Configuração Avançada via Atributos
```html
<script src="https://cdn.atend-ia.com/widget/v1/chat.js"
        data-api-key="atnd_live_xxx"
        data-agent-id="agent-uuid"
        data-theme="light"
        data-position="bottom-right"
        data-color="#2563eb"
        data-title="Fale Conosco"
        data-subtitle="Online agora"
        data-welcome-message="Olá! Como posso ajudar?"
        data-hide-launcher="false"
        async>
</script>
```

### Configuração via JavaScript
```javascript
window.AtendIAWidget = {
  apiKey: 'atnd_live_xxx',
  agentId: 'agent-uuid',
  theme: 'light',
  position: 'bottom-right',
  primaryColor: '#2563eb',
  title: 'Fale Conosco',
  welcomeMessage: 'Olá! Como posso ajudar?',
  // Pré-identificar o usuário (se já logado no site)
  user: {
    name: 'João Silva',
    email: 'joao@email.com',
    phone: '11999998888',
    customData: { plano: 'pro', conta_id: '12345' }
  },
  // Callbacks
  onOpen: () => console.log('Chat aberto'),
  onMessage: (msg) => console.log('Nova mensagem:', msg),
  onClose: () => console.log('Chat fechado'),
};
```

### API JavaScript do Widget
```javascript
// Abrir/fechar programaticamente
AtendIAWidget.open();
AtendIAWidget.close();
AtendIAWidget.toggle();

// Enviar mensagem programaticamente
AtendIAWidget.sendMessage('Preciso de ajuda com o produto X');

// Identificar usuário após login
AtendIAWidget.identify({ name: 'João', email: 'joao@email.com' });

// Destruir o widget
AtendIAWidget.destroy();
```

### Arquitetura do Widget
- JavaScript puro (sem frameworks externos) — ~15KB gzip
- Criado como Web Component customizado (`<atend-ia-chat>`)
- Comunicação via API REST + WebSocket com o backend
- Sem acesso ao DOM do site hospedeiro (isolado em Shadow DOM)
- Funciona em qualquer site: React, WordPress, Shopify, HTML puro, etc.

---

## Canais Adicionais

### Chat no Site (Widget Nativo)
Conversas iniciadas pelo widget aparecem no dashboard com canal `web_widget`.
Funciona sem WhatsApp — cliente chata direto pelo site.

### Instagram DM (API Oficial Meta)
```
Requisitos:
  - Conta do Instagram conectada a uma Página do Facebook
  - App Meta com permissão instagram_manage_messages
  - Webhook configurado na Meta Developer Console

Configuração no AtendIA:
  - Settings → Canais → Instagram → Conectar
  - Autenticação OAuth com a conta do Facebook
  - Validação do webhook Meta
```

### Telegram
```
Configuração:
  - Criar bot via @BotFather no Telegram
  - Obter API Token
  - Settings → Canais → Telegram → Inserir Token
  - Sistema registra webhook automaticamente
```

---

## Documentação OpenAPI/Swagger

Disponível em: `https://api.atend-ia.com/docs`

Gerada automaticamente via `swagger-jsdoc` e servida via `swagger-ui-express`.

```typescript
// Exemplo de anotação JSDoc
/**
 * @swagger
 * /v1/conversations:
 *   get:
 *     summary: Listar conversas
 *     tags: [Conversations]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [waiting, ai_handling, human_handling, resolved, abandoned]
 *     responses:
 *       200:
 *         description: Lista de conversas
 */
```

---

## SDK JavaScript

```
npm install @atend-ia/sdk
```

```typescript
import { AtendIA } from '@atend-ia/sdk';

const client = new AtendIA({ apiKey: 'atnd_live_xxx' });

// Listar conversas
const conversations = await client.conversations.list({ status: 'waiting' });

// Enviar mensagem
await client.conversations.sendMessage(conversationId, {
  type: 'text',
  content: 'Olá! Como posso ajudar?'
});

// Ouvir eventos via webhook (server-side)
client.webhooks.on('conversation.created', (event) => {
  console.log('Nova conversa:', event.data.conversation);
});
```

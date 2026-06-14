# Módulo 04 — Integração WhatsApp Web

---

## Visão Geral

A integração com WhatsApp é feita via **Baileys**, uma biblioteca open source que implementa o protocolo do WhatsApp Web. Isso permite conectar números de WhatsApp sem a necessidade da API Oficial do WhatsApp Business (que exige aprovação da Meta, tem custo por mensagem e restrições de uso).

> ⚠️ **IMPORTANTE:** O uso do Baileys implica em riscos e responsabilidades descritos na seção de Limitações deste documento. O AtendIA deve comunicar claramente essas limitações ao cliente durante o onboarding.

---

## Biblioteca: Baileys

- **Repositório:** `@whiskeysockets/baileys`
- **Protocolo:** Multi-Device (MD) — conexão via QR Code, sem necessidade do celular online constantemente após o primeiro scan
- **Tipos de mensagem suportados:** texto, imagem, áudio, vídeo, documento, localização, figurinhas, reações, mensagens de voz, listas, botões

---

## Fluxo de Conexão via QR Code

```
Admin acessa Painel → WhatsApp Sessions → "Adicionar Número"
        │
        ▼
Backend cria nova sessão Baileys (status: connecting)
Backend gera QR Code em base64
        │
        ▼
Frontend recebe QR Code via WebSocket (evento: session:qr_update)
Frontend renderiza QR Code para o admin escanear
        │
        ▼
Admin abre WhatsApp no celular → Dispositivos Vinculados → Escanear QR Code
        │
        ▼
Baileys detecta conexão estabelecida (evento: connection.update com status: open)
Backend salva credenciais da sessão (criptografadas) no banco
Backend atualiza status da sessão para: connected
Frontend recebe evento: session:connected → exibe "WhatsApp conectado ✅"
```

### Implementação do QR Code via WebSocket
```typescript
// Backend
sock.ev.on('connection.update', async (update) => {
  const { connection, qr, lastDisconnect } = update;

  if (qr) {
    const qrBase64 = await qrcode.toDataURL(qr);
    io.to(`company:${companyId}`).emit('session:qr_update', { sessionId, qr: qrBase64 });
    await prisma.whatsapp_sessions.update({ where: { id: sessionId }, data: { status: 'connecting', qr_code: qrBase64 } });
  }

  if (connection === 'open') {
    await prisma.whatsapp_sessions.update({ where: { id: sessionId }, data: { status: 'connected', qr_code: null } });
    io.to(`company:${companyId}`).emit('session:connected', { sessionId });
  }

  if (connection === 'close') {
    await handleDisconnect(sessionId, lastDisconnect);
  }
});
```

---

## Gestão de Múltiplas Sessões por Empresa

Cada empresa pode ter **múltiplos números de WhatsApp** conectados (limitado pelo plano):

| Plano | Números WhatsApp |
|---|---|
| Free | 1 |
| Starter | 1 |
| Pro | 3 |
| Enterprise | Ilimitado |

Cada sessão é gerenciada independentemente:
- Processo Baileys isolado por sessão (Worker Threads ou processos separados)
- Mensagens identificadas pelo `whatsapp_session_id`
- Operadores podem ser atribuídos a sessões específicas

---

## Armazenamento Seguro das Credenciais

As credenciais do Baileys (que permitem reconectar sem novo QR Code) são:
- Criptografadas com AES-256-GCM antes de salvar no banco
- A chave de criptografia fica nas variáveis de ambiente (`SESSION_ENCRYPTION_KEY`)
- Nunca expostas via API

```typescript
// Salvar credenciais
async function saveCredentials(sessionId: string, creds: AuthenticationCreds) {
  const encrypted = encrypt(JSON.stringify(creds), process.env.SESSION_ENCRYPTION_KEY!);
  await prisma.whatsapp_sessions.update({
    where: { id: sessionId },
    data: { session_data: encrypted }
  });
}

// Carregar credenciais
async function loadCredentials(sessionId: string): Promise<AuthenticationCreds | null> {
  const session = await prisma.whatsapp_sessions.findUnique({ where: { id: sessionId } });
  if (!session?.session_data) return null;
  return JSON.parse(decrypt(session.session_data, process.env.SESSION_ENCRYPTION_KEY!));
}
```

---

## Sistema de Reconexão Automática

```typescript
async function handleDisconnect(sessionId: string, lastDisconnect: any) {
  const statusCode = lastDisconnect?.error?.output?.statusCode;

  if (statusCode === DisconnectReason.loggedOut) {
    // Sessão expirou — precisa de novo QR Code
    await prisma.whatsapp_sessions.update({
      where: { id: sessionId },
      data: { status: 'disconnected', session_data: null }
    });
    notifyAdminQRRequired(sessionId);
    return;
  }

  if (statusCode === DisconnectReason.banned) {
    await prisma.whatsapp_sessions.update({
      where: { id: sessionId },
      data: { status: 'banned' }
    });
    notifyAdminBanned(sessionId);
    return;
  }

  // Outros erros: reconectar com backoff exponencial
  const attempt = await getReconnectAttempt(sessionId);
  const delay = Math.min(1000 * Math.pow(2, attempt), 60000); // máx 60s

  setTimeout(() => reconnectSession(sessionId, attempt + 1), delay);
}
```

---

## Tratamento de Tipos de Mensagem

```typescript
function normalizeWhatsAppMessage(raw: WAMessage): InternalMessage {
  const content = raw.message;

  if (content?.conversation || content?.extendedTextMessage) {
    return { type: 'text', content: content.conversation || content.extendedTextMessage?.text };
  }

  if (content?.imageMessage) {
    return { type: 'image', mediaUrl: await downloadMedia(raw), content: content.imageMessage.caption };
  }

  if (content?.audioMessage || content?.pttMessage) {
    return { type: 'audio', mediaUrl: await downloadMedia(raw) };
  }

  if (content?.videoMessage) {
    return { type: 'video', mediaUrl: await downloadMedia(raw), content: content.videoMessage.caption };
  }

  if (content?.documentMessage) {
    return { type: 'document', mediaUrl: await downloadMedia(raw), content: content.documentMessage.fileName };
  }

  if (content?.locationMessage) {
    return {
      type: 'location',
      location: {
        lat: content.locationMessage.degreesLatitude,
        lng: content.locationMessage.degreesLongitude,
        name: content.locationMessage.name,
      }
    };
  }

  if (content?.stickerMessage) {
    return { type: 'sticker', mediaUrl: await downloadMedia(raw) };
  }

  if (content?.reactionMessage) {
    return {
      type: 'reaction',
      reactionEmoji: content.reactionMessage.text,
      reactedToMessageId: content.reactionMessage.key?.id,
    };
  }

  return { type: 'text', content: '[Tipo de mensagem não suportado]' };
}
```

---

## Sincronização de Status de Mensagem

```typescript
sock.ev.on('messages.update', async (updates) => {
  for (const update of updates) {
    if (!update.update.status) continue;

    const status = mapWhatsAppStatus(update.update.status);
    // 1 = sent, 2 = delivered, 3 = read, 4 = played (áudio)

    await prisma.messages.updateMany({
      where: { whatsapp_message_id: update.key.id },
      data: { status },
    });

    io.to(`conversation:${conversationId}`).emit('message:status', {
      messageId: internalMessageId,
      status,
    });
  }
});
```

---

## Boas Práticas e Limitações

### ⚠️ Limitações Importantes

| Limitação | Descrição |
|---|---|
| **Risco de ban** | O WhatsApp pode banir números que enviam muitas mensagens em curto tempo, especialmente para números não salvos na agenda |
| **Sem API oficial** | Não é a API oficial do WhatsApp Business. A Meta pode alterar o protocolo e quebrar a integração |
| **Múltiplos dispositivos** | A conexão Multi-Device funciona melhor; o celular não precisa estar online, mas deve estar ativo ocasionalmente |
| **Figurinhas e reações** | Recebimento funciona; envio de figurinhas customizadas é mais complexo |
| **Status (Stories)** | Não suportado |
| **Grupos** | Suporte limitado; não recomendado para atendimento |

### ✅ Boas Práticas para Evitar Ban

1. **Não enviar em massa** — limite de mensagens por hora por número
2. **Aguardar resposta antes de enviar próxima** — não bombardear
3. **Usar linguagem natural** — evitar mensagens extremamente padronizadas/robóticas
4. **Respeitar opt-out** — se o cliente pedir para não ser contatado, respeitar
5. **Número com histórico** — usar números que já têm histórico de uso (não números novos)
6. **Limitar mensagens iniciadas pelo bot** — focar em responder, não em abordar

### Alerta de Ban
Se o status da sessão mudar para `banned`:
- Admin é notificado por e-mail e push notification
- Conversas ativas são movidas para `human_handling`
- Sistema suspende tentativas de reconexão
- Interface exibe alerta com orientações

---

## Estrutura de Tabelas

```sql
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name VARCHAR(255),              -- nome interno (ex: "Número Vendas")
  phone_number VARCHAR(20),       -- número com DDI (ex: 5511999998888)
  status VARCHAR(50) DEFAULT 'disconnected'
    CHECK (status IN ('disconnected','connecting','connected','banned','error')),
  session_data TEXT,              -- credenciais criptografadas
  qr_code TEXT,                   -- QR code atual (base64) durante conexão
  reconnect_attempts INTEGER DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar sessões conectadas de uma empresa
CREATE INDEX idx_wa_sessions_company_status ON whatsapp_sessions(company_id, status);
```

---

## Endpoints da API

```
GET    /whatsapp/sessions              → listar sessões da empresa
POST   /whatsapp/sessions              → criar nova sessão
DELETE /whatsapp/sessions/:id          → deletar sessão
POST   /whatsapp/sessions/:id/connect  → iniciar processo de conexão (gera QR)
POST   /whatsapp/sessions/:id/disconnect → desconectar sessão
GET    /whatsapp/sessions/:id/status   → status atual da sessão
POST   /whatsapp/sessions/:id/send     → enviar mensagem direta (uso interno)
```

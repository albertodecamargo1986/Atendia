# Módulo 06 — Sistema de Takeover Humano

---

## Visão Geral

O Takeover Humano é o mecanismo que permite a um operador assumir o controle de uma conversa que está sendo gerenciada pelo agente de IA. É um dos principais diferenciais do AtendIA: a transição é imediata, imperceptível para o cliente e completamente rastreada.

---

## Como um Operador Assume uma Conversa

### Fluxo de Assumir (Takeover)

```
Operador vê conversa com IA na lista
          │
          ▼
Clica em "Assumir Atendimento" (botão destacado)
          │
          ▼
Frontend emite: socket.emit('takeover:request', { conversationId })
          │
          ▼
Backend:
  1. Valida permissão do operador
  2. Atualiza conversation.status → 'human_handling'
  3. Atualiza conversation.assigned_operator_id → operador.id
  4. Registra mensagem de sistema: "Atendimento assumido por [Nome]"
  5. Salva em conversation_events: { type: 'takeover', by: operatorId, at: now }
          │
          ▼
Emite para TODOS no room da conversa:
  - 'takeover:started' → { conversationId, operator: { id, name } }
          │
          ▼
Agente de IA para de processar novas mensagens para esta conversa
(verificação de status antes de cada processamento da fila de IA)
```

### Notificação Imediata ao Agente de IA
O worker da fila de IA **sempre verifica** o status da conversa antes de enviar a resposta:

```typescript
async function processAIResponse(job: AIJob) {
  // Verificação de segurança: checar se ainda é IA
  const conversation = await prisma.conversations.findUnique({
    where: { id: job.conversationId },
    select: { status: true }
  });

  if (conversation?.status !== 'ai_handling') {
    // Conversa foi assumida por humano — descartar resposta da IA
    logger.info(`AI response discarded: conversation ${job.conversationId} is now human_handling`);
    return;
  }

  // Enviar resposta apenas se ainda for atendimento de IA
  await sendAIResponse(job);
}
```

---

## Indicadores Visuais na Interface

### Para o Operador que Assumiu
- Header da conversa muda para: `👤 Você está atendendo`
- Campo de digitação fica ativo e destacado
- Histórico completo da conversa (incluindo mensagens da IA) visível
- Badge "HUMANO" de cor verde no topo da conversa

### Para Outros Operadores/Supervisores
- Badge "HUMANO — João" na lista de conversas
- Na visão de supervisão, aparece no card do operador João

### Para o Cliente Final
- Nenhuma mudança visual — o cliente continua recebendo mensagens normalmente
- A mensagem de transição configurada é enviada (ex: "Transferi você para nosso atendente!")

---

## Como o Operador Devolve a Conversa para o Agente

```
Operador clica em "Devolver para IA"
          │
          ▼
Backend:
  1. Atualiza conversation.status → 'ai_handling'
  2. Remove conversation.assigned_operator_id
  3. Registra mensagem de sistema: "Atendimento devolvido ao agente"
  4. Emite evento: 'takeover:ended'
          │
          ▼
Agente retoma a partir do histórico completo da conversa
(incluindo o que o operador humano disse)
```

---

## Sistema de Alertas de Escalação

O agente de IA dispara alertas em situações de dificuldade:

### Tipos de Alerta

| Alerta | Trigger | Urgência |
|---|---|---|
| Tentativas esgotadas | Agente tentou N vezes sem resolução | 🔴 Alta |
| Sentimento negativo | Análise detectou frustração/raiva | 🔴 Alta |
| Palavra-chave de reclamação | Ex: "absurdo", "processar", "procon" | 🔴 Alta |
| Solicitação explícita | Cliente pediu para falar com humano | 🟡 Média |
| Sem resposta do cliente | Timeout configurado atingido | 🟢 Baixa |

### Interface de Alerta
Conversas com alerta aparecem:
- Com borda colorida na lista (vermelho/amarelo)
- Com ícone de alerta e badge de motivo
- Com notificação push para operadores disponíveis
- Com som de alerta (mais chamativo que mensagem nova)

### Notificação Push de Escalação
```typescript
// Notifica todos os operadores disponíveis da empresa
async function notifyEscalation(conversationId: string, reason: string, urgency: string) {
  const operators = await getAvailableOperators(companyId);
  
  for (const operator of operators) {
    io.to(`operator:${operator.id}`).emit('escalation:alert', {
      conversationId,
      reason,
      urgency,
      contact: conversation.contact_name,
      lastMessage: conversation.lastMessage,
    });
  }

  // Adiciona à fila de escalações não respondidas (alerta persistente)
  await addToEscalationQueue(conversationId, urgency);
}
```

---

## Transferência de Conversa entre Operadores

```typescript
// Endpoint: POST /conversations/:id/transfer
async function transferConversation(req, res) {
  const { conversationId } = req.params;
  const { targetOperatorId, note } = req.body;
  const fromOperator = req.user;

  await prisma.conversations.update({
    where: { id: conversationId },
    data: { assigned_operator_id: targetOperatorId }
  });

  // Nota automática de transferência
  await createSystemNote(conversationId,
    `Conversa transferida de ${fromOperator.name} para ${targetOperator.name}. ${note || ''}`
  );

  // Notifica operador alvo
  io.to(`operator:${targetOperatorId}`).emit('conversation:transferred', {
    conversationId,
    from: fromOperator,
    note,
  });
}
```

---

## Notas Internas

Visíveis **apenas para a equipe** (operadores, supervisores, admins). Nunca enviadas ao cliente.

- Campo de nota no painel lateral da conversa
- Marcadas visualmente diferente das mensagens (fundo amarelo/itálico)
- Operadores podem mencionar colegas com `@nome`
- Timestamps e autoria registrados
- Deletáveis pelo autor ou supervisor

---

## Histórico Completo da Conversa

O operador humano sempre vê **tudo** que aconteceu na conversa, incluindo:
- Mensagens enviadas pelo cliente
- Respostas do agente de IA (com label "IA")
- Mensagens enviadas por operadores anteriores (com nome)
- Mensagens de sistema (takeover, transferências, encerramentos)
- Notas internas (com destaque visual)

Isso garante que o operador nunca precisa pedir ao cliente para repetir o que já disse ao agente.

---

## Protocolo de Encerramento

```
Operador clica em "Encerrar Atendimento"
          │
          ▼
Modal de encerramento aparece:
  - Dropdown: Motivo de encerramento (Resolvido | Spam | Abandono | Outro)
  - Campo: Descrição opcional da resolução
  - Toggle: Enviar pesquisa de satisfação (CSAT)?
          │
          ▼
Backend:
  1. Atualiza conversation.status → 'resolved'
  2. Salva conversation.resolved_at = now
  3. Salva conversation.resolution = motivo + descrição
  4. Se CSAT ativado: agenda envio da pesquisa (2 min delay)
  5. Registra mensagem de sistema: "Atendimento encerrado"
          │
          ▼
Conversa arquivada e disponível no histórico
```

---

## Eventos de Auditoria

Todos os eventos de takeover são registrados em tabela de auditoria:

```sql
CREATE TABLE conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  type VARCHAR(50) CHECK (type IN (
    'created', 'ai_started', 'ai_ended',
    'takeover_started', 'takeover_ended',
    'transferred', 'resolved', 'abandoned',
    'escalation_alert', 'note_added'
  )),
  actor_id UUID REFERENCES users(id),  -- quem realizou a ação
  metadata JSONB,                       -- dados adicionais do evento
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Endpoints da API

```
POST /conversations/:id/takeover        → assumir conversa
POST /conversations/:id/release         → devolver para IA
POST /conversations/:id/transfer        → transferir para outro operador
POST /conversations/:id/resolve         → encerrar conversa
GET  /conversations/:id/events          → histórico de eventos da conversa
GET  /escalations                       → fila de escalações ativas (supervisor)
POST /escalations/:id/acknowledge       → marcar escalação como vista
```

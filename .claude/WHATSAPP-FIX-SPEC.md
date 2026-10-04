# Especificação — Correções WhatsApp (anti-banimento + fluxo) — 30/09/2026

B = packages/backend/src. Números = achados da auditoria. Prioridade absoluta: NÃO aumentar risco de banimento.
Não adicionar dependências novas (npm install é instável nesta máquina); usar o que já existe (BullMQ, ioredis, Baileys 6.7.x).

## Baileys
- Fixar `"@whiskeysockets/baileys": "6.7.24"` em packages/backend/package.json (última estável 6.x; 7.0 é RC) e atualizar o lock com `npm install --package-lock-only -w backend`. Se a 6.7.24 não estiver no cache/instalável, fixe `6.7.23` exato.

## P0
1. **Socket único/sem fantasmas** (whatsapp.service.ts:168,192-231,545-557,574-578,609-613): `manualStop: Set<string>`, `reconnectTimers: Map`, lock de start por sessão (`starting: Map<string, Promise>`). Em disconnect/reconnect/delete: marcar manualStop, limpar timer, `sock.ev.removeAllListeners(...)`, `sock.end(undefined)`. No close: se manualStop ou `activeSockets.get(id) !== sock` → return. startBaileysSession encerra o socket existente antes de criar outro.
2. **DisconnectReason** (:193-247): 401 → apaga creds, DISCONNECTED, não reconecta; 440 connectionReplaced → NÃO reconecta, DISCONNECTED (motivo "conectado em outro lugar"); 403 forbidden → status BANNED, para, emite evento para o painel; 500 badSession / 411 multideviceMismatch → apaga authDir, DISCONNECTED pedindo novo QR, sem loop; 515 restartRequired → reconecta 1x após ~1s sem contar tentativa; demais → backoff `min(5000*2^(n-1),300000)*(0.8+random*0.4)`, máx 10; contador só zera após 60s estável em open.
3. **Saudação da fila** (:438-443): só quando o ticket foi CRIADO agora (retornar `created` de findOrCreateTicket) e no máx. 1x por conversa a cada 12h; enfileirar no outbound e gravar como Message.
4. **Ritmo humano**: worker de saída serializado POR SESSÃO (fila em memória por sessionId com concorrência 1 dentro do worker, ou BullMQ limiter) — nunca 2 envios simultâneos no mesmo número; antes de cada texto: `readMessages` da última msg do cliente (se ainda não lida) → `presenceSubscribe` → `sendPresenceUpdate('composing')` → aguardar `clamp(len*45ms,1500,8000)+jitter(0..1500)` → `paused` → send. Mínimo 1,2s entre mensagens do mesmo número. **Debounce da IA**: job `ai-<conversationId>` com delay ~6s, substituindo o anterior se ainda pendente; o worker monta o contexto a partir do banco.
5. **Campanhas — política conservadora (decisão do usuário)**:
   - Destinatários: só contatos com mensagem recebida (role USER) nos últimos 90 dias E sem `optedOutAt`; validar `sock.onWhatsApp(jid)` antes de enviar (pular inexistentes).
   - Ritmo controlado NO WORKER (sleep antes de cada envio): 25–60s aleatório + pausa de 10–20 min a cada 25 envios; próximo envio agendado a partir do fim do anterior (nada de delays pré-calculados que disparam juntos após restart).
   - Cota diária por número: 200/dia; número conectado há < 14 dias: começa em 20/dia e +20%/dia até 200. Excedeu → reagenda para o próximo dia útil 9h.
   - Janela: só 9h–19h, seg–sex, fuso America/Sao_Paulo (ou do tenant); fora disso reagenda.
   - Uma campanha RUNNING por número (lock). Permitir cancelar/pausar campanha RUNNING.
   - Personalização: `{nome}` (primeiro nome do contato) e spintax `{Olá|Oi|Bom dia}`.
   - Opt-out: novo campo `Contact.optedOutAt DateTime?` (migration). Mensagem recebida normalizada (sem acento, maiúscula, trim) igual a SAIR, PARAR, STOP, CANCELAR, DESCADASTRAR → marca optedOutAt e responde UMA vez "Pronto, você não receberá mais mensagens automáticas." (via outbound). Campanhas pulam esses contatos.
   - `Campaign.whatsappSessionId String?` (migration) para escolher o número; padrão = primeira sessão CONNECTED do tenant. Envio da campanha passa pelo mesmo serializador por sessão. Gravar a mensagem da campanha na conversa do contato (criar se não existir) para a IA ter contexto quando responderem.
   - Frontend CampaignsPage: select do número, dica de `{nome}`/spintax, aviso claro das regras (quem recebe, ritmo, cota), contagem de destinatários elegíveis, botão cancelar em RUNNING.
6. **Anti-loop bot↔bot**: contador Redis por conversa; >8 respostas da IA em 10 min ou >30 em 1h → conversa HUMAN_TAKEOVER + mensagem SYSTEM "Pausamos a IA: possível conversa com robô". Ignorar (não responder) a mesma mensagem idêntica repetida >3x seguidas.
7. **Contexto da IA**: últimas 20 mensagens (`orderBy desc, take 20` → reverse), excluindo role SYSTEM (#22). Em whatsapp.service e conversation.service.
8. **Cliente volta após Encerrar** (ticket.service.ts:79-92): fechar ticket → conversa RESOLVED; em findOrCreateTicket, se já existe ticket para a conversa, reabrir em vez de criar (nunca P2002). Reabertura < 2h após resolve (#19): reativar a conversa RESOLVED (ou atualizar ticket.conversationId para a nova) — o ticket SEMPRE aponta para a conversa onde chegam as mensagens. Emitir socket da mensagem antes do ticket.
9. **Fora do horário** (offhours worker): NÃO mudar status da conversa para PENDING; aviso no máx. 1x por conversa a cada 12h (chave Redis `offhours:<convId>` + jobId `offhours-<convId>`). IA não responde fora do horário apenas por checagem de horário, sem travar status. Envio do operador funciona com qualquer status ≠ RESOLVED (backend escala para HUMAN_TAKEOVER automaticamente); `returnToAgent` aceita PENDING. Migração de dados: conversas PENDING atuais → ACTIVE.
10. **Transcrição de áudio** (voice.service.ts:131): usar `downloadMediaMessage` exportado do Baileys com `{ logger, reuploadRequest: sock.updateMediaMessage }`; transcrever em job BullMQ, não dentro do handler (#42).
11. **Envio do operador** (conversation.service.ts:166-169): remover filtro `metadata: { not: null }` inválido; obter jid do contato/ticket de forma robusta.

## P1
12. makeWASocket: `browser: Browsers.ubuntu('Chrome')`, `markOnlineOnConnect: false`, `syncFullHistory: false`, `keepAliveIntervalMs: 30000`, `connectTimeoutMs: 60000`, `retryRequestDelayMs: 350`, `maxMsgRetryCount: 5`, `msgRetryCounterCache` (cache simples em memória com interface get/set/del/flushAll — sem dep nova), `getMessage` lendo store Redis das mensagens ENVIADAS (TTL 24h, chave `wa:sent:<sessionId>:<msgId>`), `shouldIgnoreJid` (grupos, broadcast, newsletter), `generateHighQualityLinkPreview: false`. Cache da versão (fetchLatestBaileysVersion) por 24h com fallback (#31).
13. (incluído no 2) backoff com jitter.
14. Boot: reconectar só sessões CONNECTED com creds registradas, uma por vez com 3–7s entre elas.
15. Mensagens antigas: gravar, mas só acionar IA/saudação/offhours se `now - messageTimestamp < 600s`.
16. `normalizeMessageContent` (Baileys) antes de extrair texto; suportar ephemeral/viewOnce/documentWithCaption, respostas de botão/lista.
17. LID: se jid termina em `@lid`, usar `msg.key.senderPn` como telefone e salvar `lid`; `toWhatsAppJid` não aceita LID como número.
18. `fromMe` vindo do celular (não enviado pelo sistema — Set/Redis de ids enviados): gravar como mensagem do atendente com metadata.fromPhone e pausar a IA (HUMAN_TAKEOVER).
20. (incluído no 8) encerrar devolve conversa.
21. Worker de IA rechecagem status ACTIVE (e horário) antes de enfileirar envio.
23. Arquivo enviado pelo operador vai como mídia (image/video/document/audio com mimetype/fileName/caption).
24. Mídia recebida: baixar com downloadMediaMessage, salvar em tenantUploadDir(tenantId,'media'), gravar mediaUrl/mediaType; limite 16 MB.
25. PTT: gerar opus (OpenAI TTS `response_format: 'opus'`; ElevenLabs `output_format` opus se suportado, senão manter como áudio normal sem ptt) e enviar `mimetype: 'audio/ogg; codecs=opus', ptt: true`; limitar texto TTS a 600 caracteres.
26. Fuso: `TZ: America/Sao_Paulo` no backend (docker-compose.yml environment) E cálculo de horário comercial com `Intl.DateTimeFormat` no fuso `America/Sao_Paulo`.
27. Mesmo número em outra sessão: encerrar (logout) o socket antigo, filtrando por tenant.
28. Outbound `attempts: 2`, sem repetir se o envio pode ter ocorrido; gravar `waMessageId`/status em Message.metadata (#34).
29. (incluído no 4) readMessages.

## P2 (fazer)
33 dedupe por `msg.key.id` (Redis SETNX 24h). 35 saudação gravada (no 3). 36 `GET /:id/qr` exige admin e `GET /:id` oculta qrCode para não-admin. 37 (no 9). 38 conversa por contato+sessão. 39 idempotência do job de IA. 40 job diário limpando áudios TTS/recebidos > 30 dias. 41 limpar imports mortos dos arquivos que você tocar.
P2 30 (criptografar credenciais) — NÃO fazer agora (risco de perder sessões existentes); só garantir permissão 700 na pasta de auth.

## Webhooks de saída (decisão do usuário: ativar)
`webhook.service.triggerEvent(tenantId, event, payload)` nunca é chamado. Disparar (assíncrono, via fila BullMQ existente ou fire-and-forget com retry/backoff e registro em WebhookDelivery) nos eventos: `message.received`, `message.sent`, `ticket.created`, `ticket.closed`, `whatsapp.connected`, `whatsapp.disconnected`. Assinatura HMAC com o secret do webhook (veja o que o botão "testar" já faz e reuse). Só para webhooks ativos que assinam o evento. Timeout 10s. Documente os nomes dos eventos na tela de Integrações (WebhooksPage) se ela tiver lista de eventos.

## Testes
Adicionar testes vitest (padrão existente, prisma/redis mockados) para: normalização de opt-out; spintax/{nome}; cálculo de cota diária/aquecimento; janela 9–19 seg–sex no fuso; ordem do contexto (últimas 20, sem SYSTEM); decisão por DisconnectReason (função pura `decideReconnect(code)`); findOrCreateTicket reabrindo ticket existente em vez de criar.

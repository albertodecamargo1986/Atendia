# Especificação — Conexão oficial WhatsApp Cloud API (Meta) como 2ª opção

Pedido do usuário (04/10/2026): no menu WhatsApp, oferecer outra maneira de conexão — a versão oficial da Meta.
Implementar DEPOIS das correções anti-banimento (WHATSAPP-FIX-SPEC.md), reaproveitando o serializador/fluxo já corrigido.

## Conceito
- `WhatsAppSession.provider`: `'BAILEYS'` (QR Code, atual, padrão) | `'CLOUD_API'` (oficial Meta).
- Camada de provedor: interface `WhatsAppProvider { sendText, sendMedia, sendAudio, markRead, sendTyping? }` com
  implementações `BaileysProvider` (código atual) e `CloudApiProvider`. Worker de saída, IA, campanhas, saudação,
  offhours e operador passam a chamar o provedor da sessão — o fluxo (contato → conversa → ticket → IA → saída →
  socket.io) é o MESMO para os dois.
- Mensagem recebida da Cloud API entra pela mesma função de entrada usada pelo Baileys (normalizada para o mesmo
  formato interno), para não duplicar regras (horário, saudação, anti-loop, opt-out, dedupe, debounce).

## Credenciais (por sessão, cifradas como TenantApiKey — AES com SESSION_ENCRYPTION_KEY)
- `phoneNumberId`, `wabaId` (WhatsApp Business Account ID), `accessToken` (token permanente de usuário do sistema),
  `appSecret` (para validar assinatura do webhook), `verifyToken` (gerado pelo sistema, aleatório).
- Nunca devolver token/appSecret ao frontend (só "configurado ✓" e últimos 4 caracteres).

## Webhook (público, sem auth JWT)
- `GET /api/whatsapp/cloud/webhook/:sessionId` — verificação Meta: `hub.mode=subscribe`, `hub.verify_token` == verifyToken
  da sessão → responder `hub.challenge` (texto puro, 200); senão 403.
- `POST /api/whatsapp/cloud/webhook/:sessionId` — validar `X-Hub-Signature-256` = `sha256=` HMAC-SHA256(rawBody,
  appSecret) com timingSafeEqual (já existe `req.rawBody`); responder 200 rápido e processar assíncrono (fila).
  Tratar `messages` (text, image, audio, video, document, sticker, interactive button/list reply, reaction ignorar),
  `statuses` (sent/delivered/read/failed → Message.metadata.deliveryStatus; erros 131047 "fora da janela de 24h",
  131026 etc. → mensagem SYSTEM explicando ao operador).
- Rate limit próprio (webhookLimiter). Ignorar eventos de outros phone_number_id.

## Envio (Graph API, versão fixa ex. v21.0 — constante configurável)
- `POST https://graph.facebook.com/{ver}/{phoneNumberId}/messages` com Bearer accessToken.
  Texto: `{messaging_product:'whatsapp', to, type:'text', text:{body, preview_url:false}}`.
  Mídia: subir via `POST /{phoneNumberId}/media` (multipart) ou link público; áudio PTT: `type:'audio'` com ogg/opus.
  Marcar como lido: `{messaging_product:'whatsapp', status:'read', message_id}` (+ typing indicator se disponível).
- **Janela de 24h**: fora dela só é permitido TEMPLATE aprovado. O sistema deve: guardar `lastCustomerMessageAt`
  por conversa; se fora da janela, bloquear envio livre e mostrar ao operador "Fora da janela de 24h — use um modelo
  aprovado"; IA nunca tenta enviar fora da janela.
- Templates: `GET /{wabaId}/message_templates` (listar aprovados, cache 1h); envio `type:'template'` com
  `{name, language:{code}, components:[{type:'body', parameters:[{type:'text', text:'...'}]}]}`.
- Campanhas com provedor CLOUD_API: SÓ via template aprovado (selecionar template + mapear {nome}); respeitam o
  limite de mensagens da conta Meta (tier) — sem as pausas longas do Baileys (a Meta controla), mas mantendo opt-out.
- Erros da Graph API mapeados para mensagens em português (token inválido/expirado 190, permissão 10/200,
  número não registrado, limite de taxa 4/80007/130429, fora da janela 131047).

## UI (WhatsApp › Números)
- Botão "Conectar número" abre escolha com 2 cartões:
  1. **Rápida (QR Code)** — "Use o WhatsApp do seu celular. Grátis, pronto em 1 minuto. Conexão não oficial: siga
     as boas práticas para evitar bloqueio." → fluxo atual.
  2. **Oficial (API da Meta)** — "Conexão oficial e estável, ideal para empresas e disparos. Exige conta no Meta
     Business, número dedicado e domínio com HTTPS. A Meta cobra por conversa iniciada pela empresa." → assistente.
- Assistente Oficial (passo a passo para leigo, com links): 1) Pré-requisitos (domínio HTTPS — se PUBLIC_URL não for
  https, mostrar alerta com instrução `sudo atendia config` → Domínio; Meta Business; app em developers.facebook.com
  com produto WhatsApp); 2) colar Phone Number ID, WABA ID, token permanente, App Secret (campos com ajuda "onde
  encontro?"); 3) mostrar URL do webhook (`{PUBLIC_URL}/api/whatsapp/cloud/webhook/{sessionId}`) e Verify Token com
  botões copiar + instrução de assinar o campo `messages`; 4) botão "Testar conexão" (GET /{phoneNumberId} → nome
  e número verificados, qualidade/tier) e "Enviar mensagem de teste" (para um número informado, com template
  `hello_world` se fora da janela).
- Cartão da sessão mostra selo "Oficial (Meta)" ou "QR Code", status, qualidade do número (GREEN/YELLOW/RED) e tier
  quando oficial.
- Operador no painel: aviso de janela de 24h e seletor de template quando necessário.

## Backend extra
- Migration: `WhatsAppSession.provider` (enum, default BAILEYS), `cloudConfig Json?` (cifrado) ou colunas próprias,
  `Conversation.lastCustomerMessageAt DateTime?`.
- Boot: sessões CLOUD_API não abrem socket; status = CONNECTED se credenciais testadas OK.
- Limites de plano (maxWhatsapp) valem para os dois tipos.
- Testes: assinatura do webhook (válida/inválida), verificação GET, normalização de payload recebido, janela de 24h,
  envio de template, mapeamento de erros, worker roteando para o provedor certo.

## Infra
- Webhook exige HTTPS público: documentar no install/GUIA-INSTALACAO.md e no assistente; Caddy já faz HTTPS ao
  configurar domínio (`sudo atendia config`). Nenhuma variável global nova (credenciais são por sessão).

## Sem domínio hoje (decisão do usuário 04/10): código pronto + lugar para cadastrar o domínio no futuro
- Toda URL pública (webhook da Meta, links) é derivada de `PUBLIC_URL` em tempo de execução — nada fixo. Enquanto
  `PUBLIC_URL` não for https, o cartão "Oficial (API da Meta)" aparece habilitado para preencher e salvar credenciais,
  mas com alerta claro: "A Meta só envia mensagens para endereços com HTTPS. Cadastre seu domínio em
  Administração › Domínio e HTTPS para ativar." O botão "Testar conexão" (chamada de SAÍDA à Graph API) funciona sem
  domínio; o recebimento só passa a funcionar após o domínio.
- **Nova tela (SUPER_ADMIN): Administração › Domínio e HTTPS** (`/admin/domain`):
  - Mostra endereço atual (PUBLIC_URL), se tem HTTPS, IP público do servidor.
  - Campo "Seu domínio" + e-mail para o certificado; botão "Verificar DNS" (backend resolve o domínio com
    dns.resolve4 e compara com o IP público do servidor — obtido de `SERVER_PUBLIC_IP` no .env, preenchido pelo
    instalador, com fallback a serviço externo) e explica, passo a passo, como apontar o DNS (DuckDNS grátis / registro A).
  - Botão "Aplicar domínio" (só habilita com DNS OK): grava um pedido em arquivo de controle
    `/app/control/domain-request.json` ({domain, email, requestedBy, requestedAt}) — volume bind `./control:/app/control`
    no docker-compose (rw para o backend, dono app).
  - Status do pedido (pendente / aplicado / erro com mensagem) lido de `/app/control/domain-status.json`.
- **Aplicação no servidor (host)**: o `install/atendia` ganha subcomando `atendia aplicar-dominio-pendente` que lê
  `/opt/atendia/control/domain-request.json`, valida o domínio (regex estrita de hostname, sem espaços/caracteres de
  shell), confere DNS → IP, reutiliza a MESMA lógica do `atendia config` > Domínio (atualiza SITE_ADDRESS, PUBLIC_URL,
  ACME_EMAIL no .env, recria web+backend), escreve domain-status.json e remove o request. Agendado por
  `/etc/cron.d/atendia` a cada minuto (instalado pelo install.sh e pelo `atendia update`, idempotente).
  Também comando manual `sudo atendia dominio <dominio> [email]`.
  Segurança: só SUPER_ADMIN cria o pedido; o host nunca executa nada vindo do arquivo além do domínio/e-mail validados.
- Após aplicar, o painel mostra a nova URL do webhook da Meta pronta para copiar.

# Auditoria completa do AtendIA — Setembro/2026

Auditoria em três frentes: **backend**, **frontend/usabilidade** e **infraestrutura/deploy**.
Severidade: **P0** = quebra o sistema ou expõe dados · **P1** = problema sério · **P2** = melhoria.
A coluna **Status** mostra a situação após as correções (commits `66138cb`, `f03e574`, `e2d7a3e`, `d5f2158`).

**Depois das correções:** typecheck com 0 erros; 105 de 105 testes passando; banco novo criado por completo pelas migrations (38 tabelas); smoke test em Docker validando isolamento entre empresas, webhooks e uploads; memória em repouso de cerca de 140 MB.

## Resumo para quem não é técnico

| Pergunta | Resposta antes da correção |
|---|---|
| O sistema compila? | Sim, zero erros de TypeScript. |
| Os testes passam? | 72 de 75. Os 3 que falham foram quebrados por uma alteração que ainda não tinha sido commitada. |
| Dá para instalar do zero numa VPS nova? | **Não.** Faltavam 9 tabelas no banco, os volumes tinham que ser criados à mão, o caminho do `.env` era fixo e o WhatsApp não conseguia gravar a sessão. |
| É seguro abrir o cadastro para o público? | **Não.** Qualquer pessoa que se cadastrasse virava "dona da plataforma" e via todas as empresas. Também dava para aprovar pagamentos falsos e mudar de plano sem pagar. |
| A experiência do usuário é boa? | Não. Erros apareciam como "[object Object]", o chat não atualizava sozinho, a sessão caía a cada 15 minutos e o QR Code às vezes não aparecia. O "assistente" inicial era só texto. |
| Havia segredos no GitHub? | **Sim.** Uma sessão real do WhatsApp, senhas do banco, chaves JWT e a chave de criptografia. |

---

## 1. Segurança (backend)

| # | Sev | Achado | Onde | Status |
|---|---|---|---|---|
| S1 | P0 | Todo cadastro vira OWNER, e OWNER acessa o `/admin` global: vê e altera todos os tenants, troca a senha de qualquer usuário, cria cupons e confirma pagamentos | `routes/admin.ts:11`, `services/auth.service.ts:75` | **corrigido** (Fase 1) |
| S2 | P0 | Webhook do Stripe sem verificação de assinatura | `routes/payments.ts:126` | **corrigido** (Fase 1) |
| S3 | P0 | Webhook do Mercado Pago sem verificação quando o secret está vazio; confia no body; manifest da assinatura errado | `routes/payments.ts:40-110`, `services/mercadopago.service.ts:218` | **corrigido** (Fase 1) |
| S4 | P0 | `POST /payments/upgrade-plan` troca o plano sem pagamento | `routes/payments.ts:191` | **corrigido** (Fase 1) |
| S5 | P0 | Token temporário do 2FA é aceito como token de acesso; `/2fa/setup` troca o secret sem verificação | `lib/jwt.ts:30`, `middlewares/auth.ts:28`, `services/two-factor.service.ts:138` | **corrigido** (Fase 1) |
| S6 | P0 | Campanha aceita contatos de outro tenant (envia e expõe nome e telefone) | `services/campaign.service.ts:25,92` | **corrigido** (Fase 1) |
| S7 | P0 | Sessão WhatsApp, `.env.production` e chave de criptografia versionados no git | `packages/backend/whatsapp-auth/`, `.env.production`, `docker-compose.yml:63` | **corrigido (Fase 0)**. Troca dos segredos: ação manual |
| S8 | P1 | IDORs entre tenants em filas, tags, tickets e conversas | `routes/queues.ts:31-49`, `routes/tags.ts:59-73`, `services/ticket.service.ts:201`, `services/conversation.service.ts:29` | **corrigido** (Fase 1) |
| S9 | P1 | `/uploads` sem escopo de tenant | `index.ts:109` | **corrigido** (Fase 1) |
| S10 | P1 | Operador pode apagar agentes, sessões WhatsApp e chaves de API (não há autorização por papel) | várias rotas | **corrigido** (Fase 1) |
| S11 | P1 | `requireModule` libera qualquer OWNER, então o plano FREE acessa todos os módulos | `middlewares/feature-gate.ts:14` | **corrigido** (Fase 1) |
| S12 | P2 | Token aceito por query string; DMs do chat interno emitidas para o tenant inteiro | `middlewares/auth.ts:19`, `services/internal-chat.service.ts:27` | **corrigido** (Fase 1) |

## 2. Funcionamento (backend)

| # | Sev | Achado | Onde | Status |
|---|---|---|---|---|
| F1 | P0 | Senha do seed (`admin321`) não passa na validação do login, então o login dá erro 422 | `services/auth.service.ts:12` | **corrigido** (Fase 2) |
| F2 | P0 | Endereço WhatsApp errado (`@s.whats.net`): campanhas e respostas nunca entregam pelo fallback | `workers/campaign.worker.ts:56`, `ai-response.worker.ts:82`, `offhours-message.worker.ts:48`, `conversation.service.ts:162` | **corrigido** (Fase 2) |
| F3 | P0 | Só existe uma sessão WhatsApp "conectando" no sistema inteiro (`phoneNumber=''` é único) | `services/whatsapp.service.ts:86` | **corrigido** (Fase 2) |
| F4 | P0 | Plano ENTERPRISE (limite -1) não consegue conectar WhatsApp nem criar agente | `whatsapp.service.ts:74`, `agent.service.ts:60` | **corrigido** (Fase 2) |
| F5 | P0 | 9 tabelas sem migration: banco novo fica incompleto e o erro é engolido | `prisma/migrations`, `Dockerfile.prod:60` | **corrigido** (Fase 2) |
| F6 | P1 | `tenantMiddleware` async: tenant inativo deixa a requisição pendurada | `middlewares/tenant.ts:19-30` | **corrigido** (Fase 2) |
| F7 | P1 | Campanha agendada não dispara; aceita campanha cancelada; sem intervalo entre envios (risco de ban) | `workers/campaign.worker.ts:31`, `campaign.service.ts:50,70` | **corrigido** (Fase 2) |
| F8 | P1 | Auto-atribuição de ticket nunca acontece (transação) | `services/ticket.service.ts:22-98` | **corrigido** (Fase 2) |
| F9 | P1 | Conectar WhatsApp derruba sessões de outros tenants; IA responde em grupos; logout marcado como BANNED | `whatsapp.service.ts:65,153,258` | **corrigido** (Fase 2) |
| F10 | P1 | Refresh de token: corrida gera erro 500 e sessões duplicadas | `services/auth.service.ts:213` | **corrigido** (Fase 2) |
| F11 | P1 | Uploads de base de conhecimento e voz em caminhos errados, fora do volume | `routes/knowledge.ts:13`, `routes/voice-profiles.ts:20` | **corrigido** (Fase 2) |
| F12 | P2 | Temperatura do agente ignorada; `SMTP_SECURE="false"` vira true; lista de "online" nunca preenche | `ai.service.ts:114`, `config/index.ts:46`, `index.ts:150` | **corrigido** (Fase 2) |
| F13 | P2 | Webhooks de saída nunca disparam (`triggerEvent` não é chamado); `enforceLimit` quebrado | `services/webhook.service.ts:82`, `middlewares/plan-enforcer.ts` | parcial: `enforceLimit` removido; disparo automático de webhooks de saída ainda não implementado |

## 3. Usabilidade (frontend)

| # | Sev | Achado | Onde | Status |
|---|---|---|---|---|
| U1 | P0 | Mensagens de erro aparecem como "[object Object]" ou deixam a tela branca (cerca de 60 lugares) | `stores/auth.ts:39` e páginas | **corrigido** (Fase 3) |
| U2 | P0 | Chat e tickets não atualizam em tempo real (socket desligado no build de produção e handlers com estado antigo) | `hooks/useSocket.ts`, `ConversationsPage.tsx:109`, `TicketsPage.tsx:144` | **corrigido** (Fase 3) |
| U3 | P0 | Usuário deslogado a cada ~15 min (corrida no refresh) | `services/api.ts:31-74` | **corrigido** (Fase 3) |
| U4 | P0 | QR Code do WhatsApp pode não aparecer; "Reconectar" não mostra o QR | `WhatsAppPage.tsx:117-148` | **corrigido** (Fase 3) |
| U5 | P0 | Página de preços pública manda o visitante para o login | `PricingPage.tsx:81` | **corrigido** (Fase 3) |
| U6 | P1 | "Assistente" inicial só com texto, sem ações reais, e o modal final não fecha | `OnboardingWizard.tsx` | **corrigido** (Fase 3) |
| U7 | P1 | Salvar chave de IA no admin sempre falha (campo errado) | `AdminSettingsPage.tsx:32` | **corrigido** (Fase 3) |
| U8 | P1 | Operador vê menus que não pode usar; chat interno e transferência falham (403) | `Sidebar.tsx`, `InternalChatPage.tsx:33` | **corrigido** (Fase 3) |
| U9 | P1 | Nenhum aviso de sucesso ou erro (toasts); vários erros engolidos em silêncio | várias páginas | **corrigido** (Fase 3) |
| U10 | P1 | Sem layout para celular em Conversas, Tickets e Admin | várias páginas | **corrigido** (Fase 3) |
| U11 | P1 | Modo escuro com cartões brancos (cores fixas em 23 páginas) | várias páginas | **corrigido** (Fase 3) |
| U12 | P1 | Não é possível escolher qual agente atende qual número; testar o agente o ativa sem avisar | `WhatsAppPage`, `AgentBuilderPage.tsx:120` | **corrigido** (Fase 3) |
| U13 | P2 | Textos sem acento e mistura com inglês (Tickets, Takeover, Upgrade, API Keys) | várias páginas | **corrigido** (Fase 3) |
| U14 | P2 | Cadastro pede "slug" técnico; sem confirmação de senha | `RegisterPage.tsx:109` | **corrigido** (Fase 3) |
| U15 | P2 | `confirm()` nativo; botões de ícone sem `aria-label`; restos da versão desktop na tela de preços | várias | **corrigido** (Fase 3) |

## 4. Infraestrutura e deploy

| # | Sev | Achado | Onde | Status |
|---|---|---|---|---|
| I1 | P0 | Volumes `external: true` e `.env` com caminho fixo `/opt/atendia`: não sobe numa VPS nova | `docker-compose.yml:9,50,90-102` | **corrigido** (Fases 4–5) |
| I2 | P0 | Sessão do WhatsApp em pasta sem volume e sem permissão de escrita | `docker-compose.yml:77`, `Dockerfile.prod:56` | **corrigido** (Fases 4–5) |
| I3 | P0 | Sem HTTPS | `nginx.conf` | **corrigido** (Fases 4–5) |
| I4 | P0 | Workflow de deploy quebrado (copia a pasta `deploy/`, que foi apagada) | `.github/workflows/deploy.yml:57` | **corrigido** (Fases 4–5) |
| I5 | P1 | Backend exposto direto na porta 3001, passando por fora do proxy | `docker-compose.yml:44` | **corrigido** (Fases 4–5) |
| I6 | P1 | Sem limite de memória e build feito na VPS: estoura numa máquina de 1 GB | `docker-compose.yml`, `Dockerfile.prod` | **corrigido** (Fases 4–5) |
| I7 | P1 | `dist/` versionado e usado na imagem, divergindo do código-fonte | `.gitignore`, `Dockerfile.prod:43` | **corrigido** (Fases 0 e 4) |
| I8 | P1 | Sem backup automático | — | **corrigido** (Fases 4–5) |
| I9 | P1 | Nenhum instalador (o antigo foi apagado) | — | **corrigido** (Fases 4–5) |
| I10 | P2 | Roteamento nginx por regex e header `Accept` (frágil); rota `/onboarding` faltando | `nginx.conf:76` | **corrigido** (Fases 4–5) |

---

## Ações manuais do responsável (não automatizáveis)

1. **WhatsApp:** no celular do número que estava conectado, abra WhatsApp → Aparelhos conectados e desconecte todos os aparelhos "AtendIA". A sessão antiga ficou exposta no GitHub.
2. **VPS antiga (163.176.179.132):** se ainda estiver ligada, troque as senhas ou desligue a máquina. As senhas do banco e as chaves JWT estavam no GitHub. O novo instalador gera segredos novos automaticamente.
3. **Histórico do git:** os segredos antigos continuam no histórico, mas deixam de valer depois dos passos 1 e 2. Se o repositório for público, considere torná-lo privado.

## Pendências conhecidas (após as correções)

- Webhooks de saída (Integrações) só disparam no botão "Testar". O disparo automático por evento ainda não foi implementado.
- Migrations antigas não são idempotentes. Um banco da VPS antiga sem registro em `_prisma_migrations` precisa de `prisma migrate resolve --applied <nome>` antes. Instalações novas não são afetadas.
- Pagamentos exigem `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` (configure com `sudo atendia config`). Sem eles, o checkout responde "Pagamentos ainda não configurados".
- O aceite de termos no cadastro ainda não tem página de termos.
- Frontend: um bloco `vendor` de ~790 kB. Code-splitting por rota é uma melhoria futura.
- Não testados ainda: `install.sh` numa VM Ubuntu nova e o workflow do GHCR (só roda após o push).

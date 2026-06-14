# AtendIA — Roadmap de Desenvolvimento

---

## Visão Geral das Fases

| Fase | Nome | Estimativa | Status |
|---|---|---|---|
| 1 | Fundação | 1–2 semanas | 🔜 Próxima |
| 2 | Motor de Chat | 1–2 semanas | ⏳ Aguardando |
| 3 | Agente de IA | 2 semanas | ⏳ Aguardando |
| 4 | Integração WhatsApp | 1–2 semanas | ⏳ Aguardando |
| 5 | Takeover Humano | 1 semana | ⏳ Aguardando |
| 6 | Dashboard e Relatórios | 1–2 semanas | ⏳ Aguardando |
| 7 | Widget e Integrações | 1–2 semanas | ⏳ Aguardando |
| 8 | Desktop e Licenciamento | 2 semanas | ⏳ Aguardando |

---

## Fase 1 — Fundação
**Estimativa:** 1–2 semanas

### Objetivos
- Estrutura base do monorepo configurada e funcionando
- Banco de dados modelado e migrações rodando
- Autenticação completa (cadastro, login, JWT, refresh token)
- Multi-tenant funcional com isolamento por `company_id`
- Docker Compose com todos os serviços locais

### Entregas
- [ ] Estrutura de pastas do monorepo (`/packages/backend`, `/packages/frontend`, `/packages/desktop`, `/packages/shared`)
- [ ] `docker-compose.yml` com PostgreSQL, Redis, backend e frontend
- [ ] Schema Prisma com todas as entidades principais
- [ ] API de autenticação (register, login, refresh, logout, forgot-password)
- [ ] Sistema de perfis e permissões (RBAC)
- [ ] Middleware de tenant isolation
- [ ] Frontend: telas de login, registro de empresa, recuperação de senha
- [ ] Testes de integração básicos para auth

### Dependências
- Nenhuma (fase inicial)

---

## Fase 2 — Motor de Chat
**Estimativa:** 1–2 semanas

### Objetivos
- Engine de mensagens em tempo real funcionando
- Interface de atendimento básica para operadores
- Sistema de filas com Redis/BullMQ

### Entregas
- [ ] Servidor Socket.io configurado e integrado ao backend
- [ ] Eventos: `message:new`, `message:status`, `conversation:update`, `operator:typing`
- [ ] Worker de processamento de mensagens com BullMQ
- [ ] API REST para CRUD de conversas e mensagens
- [ ] Frontend: interface de lista de conversas + área de chat
- [ ] Suporte a múltiplos tipos de mensagem (texto, imagem, áudio, documento)
- [ ] Indicador de "digitando..." e status de leitura
- [ ] Notificações sonoras e visuais para novas mensagens
- [ ] Distribuição de conversas entre operadores disponíveis

### Dependências
- Fase 1 concluída

---

## Fase 3 — Agente de IA
**Estimativa:** 2 semanas

### Objetivos
- Agent Builder visual completo
- Agente respondendo conversas automaticamente
- Regras de escalação para humano funcionando

### Entregas
- [ ] Agent Builder: wizard de configuração passo a passo
- [ ] Configuração de persona, tom de voz e nome do agente
- [ ] Upload e indexação de base de conhecimento (PDF, texto, URL)
- [ ] Configuração de FAQs com respostas automáticas
- [ ] Regras de escalação (palavras-chave, sentimento negativo, timeout)
- [ ] Preview em tempo real do agente na interface
- [ ] Integração com OpenAI (GPT-4o-mini como padrão)
- [ ] Sistema de contexto: histórico + persona + knowledge base → prompt
- [ ] Configuração de horário de atendimento do agente
- [ ] Tooltips de ajuda contextual em todos os campos do builder

### Dependências
- Fase 2 concluída

---

## Fase 4 — Integração WhatsApp
**Estimativa:** 1–2 semanas

### Objetivos
- Conexão real com WhatsApp via QR Code
- Múltiplas sessões por empresa
- Reconexão automática

### Entregas
- [ ] Integração com biblioteca Baileys
- [ ] Fluxo de conexão via QR Code na interface (polling ou WebSocket)
- [ ] Gestão de múltiplas sessões WhatsApp por empresa
- [ ] Armazenamento criptografado das credenciais de sessão
- [ ] Reconexão automática com backoff exponencial
- [ ] Tratamento de todos os tipos de mensagem do WhatsApp
- [ ] Sincronização de status (enviado, entregue, lido)
- [ ] Página de gerenciamento de sessões no painel admin
- [ ] Alertas de sessão desconectada

### Dependências
- Fases 2 e 3 concluídas

---

## Fase 5 — Takeover Humano
**Estimativa:** 1 semana

### Objetivos
- Operador assume conversa em um clique
- Agente para de responder imediatamente
- Transferência entre operadores

### Entregas
- [ ] Botão "Assumir Atendimento" na interface do operador
- [ ] Evento Socket.io que sinaliza ao agente para parar
- [ ] Indicador visual "Atendimento Humano" na conversa
- [ ] Botão "Devolver para o Agente"
- [ ] Sistema de alertas para conversas não resolvidas (após N tentativas)
- [ ] Transferência de conversa entre operadores humanos
- [ ] Notas internas (visíveis apenas para a equipe)
- [ ] Histórico completo incluindo respostas anteriores do agente
- [ ] Protocolo de encerramento com registro de resolução

### Dependências
- Fases 3 e 4 concluídas

---

## Fase 6 — Dashboard e Relatórios
**Estimativa:** 1–2 semanas

### Objetivos
- Dashboard em tempo real com métricas principais
- Relatórios exportáveis
- Visão de supervisão dos operadores

### Entregas
- [ ] Cards de métricas em tempo real (conversas ativas, na fila, resolvidas)
- [ ] Gráfico de volume por hora, dia e semana
- [ ] Tempo médio de resposta por operador e pelo agente
- [ ] Satisfação do cliente (CSAT — pesquisa automática ao fechar conversa)
- [ ] Painel de supervisão: todos os operadores + conversas em andamento
- [ ] Exportação de relatórios em CSV e PDF
- [ ] Filtros por período, operador, tag e canal
- [ ] Taxa de resolução pelo agente vs. escalação para humano

### Dependências
- Fase 5 concluída

---

## Fase 7 — Widget e Integrações
**Estimativa:** 1–2 semanas

### Objetivos
- API pública documentada
- Widget embedável funcionando
- Webhooks configuráveis

### Entregas
- [ ] API REST pública com autenticação por API Key
- [ ] Documentação OpenAPI/Swagger auto-gerada
- [ ] Widget JavaScript puro (sem dependências externas)
- [ ] Customização do widget: cores, logo, mensagem de abertura
- [ ] Webhooks: configuração via interface + envio de eventos
- [ ] SDK JavaScript para integração
- [ ] Integração com chat no site (canal nativo da plataforma)
- [ ] Estrutura base para Instagram DM e Telegram

### Dependências
- Fase 6 concluída

---

## Fase 8 — Versão Desktop e Licenciamento
**Estimativa:** 2 semanas

### Objetivos
- Versão Electron funcionando como .exe instalável
- Sistema de licenciamento por serial completo
- Página de vendas e checkout

### Entregas
- [ ] Projeto Electron configurado com electron-builder
- [ ] Core da aplicação adaptado para rodar localmente
- [ ] SQLite local com sincronização opcional
- [ ] Tela de ativação por serial no primeiro uso
- [ ] Geração de serial após compra (integração com Stripe/Mercado Pago)
- [ ] Validação de licença online e offline (HWID + criptografia)
- [ ] Sistema de alertas de expiração (30/7/1 dia antes)
- [ ] Auto-update via electron-updater
- [ ] Página de vendas e checkout
- [ ] Painel do cliente para ver licenças
- [ ] Painel admin para gerenciar todos os clientes

### Dependências
- Fase 7 concluída (core estável)

---

## Features Bônus (Pós-Lançamento)

Estas features serão priorizadas com base no feedback dos primeiros clientes:

| Feature | Descrição | Impacto |
|---|---|---|
| Busca no histórico | Busca full-text em todas as conversas | Alto |
| Roteamento inteligente | Direcionar conversa por assunto/palavra-chave para o operador certo | Alto |
| Relatórios do agente | Análise de performance do agente de IA (acertos, falhas, escalações) | Médio |
| Modo de treinamento | Operador corrige resposta do agente → agente aprende | Alto |
| Blacklist de palavras | Palavras bloqueadas para disparo de respostas | Médio |
| Horário de atendimento | Configurar horários por dia da semana com mensagens automáticas | Alto |
| Mensagens de ausência | Resposta automática fora do horário | Alto |
| Follow-up automático | Agendamento de mensagem de acompanhamento após X horas/dias | Médio |
| Campanhas de mensagem | Disparar mensagem para lista de contatos (com cuidado legal) | Médio |
| App mobile operador | App para operadores atenderem pelo celular | Alto |

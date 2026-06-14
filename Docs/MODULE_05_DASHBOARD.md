# Módulo 05 — Dashboard e Painel de Atendimento

---

## Visão Geral

O Dashboard é a interface principal do AtendIA para operadores e gestores. É composto por três áreas principais: o painel de métricas em tempo real, a interface de atendimento (onde os operadores interagem com os clientes) e o painel de supervisão (para gestores e supervisores).

---

## 1. Visão Geral — Métricas em Tempo Real

### Cards de Status Instantâneo
Atualizados via Socket.io sem necessidade de refresh:

| Métrica | Descrição | Ícone |
|---|---|---|
| Conversas Ativas | Em atendimento humano agora | 🟢 |
| Na Fila | Aguardando operador disponível | 🟡 |
| Com o Agente IA | Sendo atendidas pelo agente | 🤖 |
| Resolvidas Hoje | Total encerradas no dia | ✅ |
| Tempo Médio de Resposta | Média do dia atual | ⏱️ |
| Taxa de Resolução IA | % resolvidas sem intervenção humana | 📊 |

### Gráficos de Volume
- **Volume por hora** (gráfico de barras, dia atual)
- **Volume por dia** (gráfico de linha, últimos 30 dias)
- **Volume por canal** (pizza: WhatsApp, Widget, Instagram, etc.)
- **Distribuição por operador** (barras horizontais)

---

## 2. Lista de Conversas

### Colunas e Informações
- Avatar/foto do contato (inicial do nome se não tiver foto)
- Nome e número do contato
- Última mensagem (preview)
- Tempo da última mensagem
- Status visual (ícone colorido)
- Operador atribuído (avatar)
- Tags da conversa

### Filtros Disponíveis
```
Status:     [ Todas | Na Fila | Ativas | Com IA | Resolvidas | Abandonadas ]
Canal:      [ Todos | WhatsApp | Widget | Instagram | Telegram ]
Operador:   [ Todos | Eu | Sem atribuição | <nome do operador> ]
Período:    [ Hoje | Ontem | 7 dias | 30 dias | Personalizado ]
Tags:       [ Multiselect de tags cadastradas ]
Busca:      [ Campo de texto livre — busca no nome e mensagens ]
```

### Ordenação
Por padrão: conversas na fila primeiro, depois ativas, ordenadas por tempo de espera (mais antiga primeiro).

---

## 3. Interface de Atendimento

Layout de três colunas:
```
┌──────────────┬────────────────────────┬─────────────────┐
│ Lista de     │ Área de Chat           │ Informações do  │
│ Conversas    │                        │ Contato         │
│              │ [mensagens]            │                 │
│              │                        │ Nome            │
│              │                        │ Telefone        │
│              │                        │ Tags            │
│              │                        │ Notas           │
│              │ [campo de digitação]   │ Histórico       │
└──────────────┴────────────────────────┴─────────────────┘
```

### Área de Chat (coluna central)
- Bolhas de mensagem diferenciadas por remetente (cliente, IA, humano, sistema)
- Label indicando quem enviou cada mensagem ("Sofia (IA)", "João (Operador)", etc.)
- Ícones de status de mensagem (enviado, entregue, lido)
- Suporte a visualização de imagem, player de áudio, download de documentos
- Campo de texto com suporte a **emoji picker**, **upload de arquivo** e **templates**
- Botões de ação: "Assumir Atendimento", "Devolver para IA", "Encerrar Conversa", "Transferir"
- Indicador visual claro: "🤖 IA em atendimento" ou "👤 Atendimento Humano - João"

### Informações do Contato (coluna direita)
- Nome e número do contato (editável)
- Canal de origem e sessão WhatsApp
- Data do primeiro e último contato
- Número total de conversas anteriores
- Tags da conversa (adicionáveis com autocompletar)
- Notas internas (visíveis apenas para a equipe)
- Link para histórico completo de conversas anteriores

### Templates de Resposta Rápida
- Operadores cadastram respostas prontas para perguntas frequentes
- Acesso via `/` no campo de digitação → lista de templates com busca
- Templates com variáveis: `{nome_cliente}`, `{numero_pedido}`, etc.

---

## 4. Painel de Supervisão

Exclusivo para supervisores e admins. Mostra visão geral de toda a equipe.

### Mapa de Operadores
Grid com card de cada operador online:
```
┌─────────────────────┐
│ 👤 João Silva       │
│ 🟢 Disponível       │
│ 3 conversas ativas  │
│ Tempo médio: 4min   │
└─────────────────────┘
```

Status possíveis: 🟢 Disponível | 🟡 Ocupado | 🔴 Ausente | ⚫ Offline

O supervisor pode:
- Ver qualquer conversa de qualquer operador (somente leitura)
- Transferir uma conversa de um operador para outro
- Entrar em uma conversa como suporte silencioso (nota interna)
- Alterar o status de um operador

---

## 5. Relatórios e Exportação

### Relatórios Disponíveis
| Relatório | Descrição | Formato |
|---|---|---|
| Volume de atendimento | Conversas por período, canal, operador | CSV, PDF |
| Tempo de resposta | Médias por operador e geral | CSV, PDF |
| Taxa de resolução | IA vs. Humano | CSV, PDF |
| Satisfação (CSAT) | Notas e comentários dos clientes | CSV, PDF |
| Desempenho de operadores | Métricas individuais | CSV, PDF |
| Escalações | Motivos e frequência de escalação da IA | CSV, PDF |

### CSAT (Customer Satisfaction Score)
Ao encerrar uma conversa, o sistema aguarda 2 minutos e envia automaticamente:
```
"Olá! Como foi seu atendimento hoje?
⭐ Ruim | ⭐⭐ Regular | ⭐⭐⭐ Bom | ⭐⭐⭐⭐ Ótimo | ⭐⭐⭐⭐⭐ Excelente

Opcional: deixe um comentário"
```
(Implementado como mensagem interativa ou texto simples dependendo do canal)

---

## 6. Componentes React Necessários

```
/components/dashboard/
├── MetricCard.tsx              → card de métrica com ícone e valor
├── VolumeChart.tsx             → gráfico de barras com Recharts
├── ConversationList.tsx        → lista de conversas com filtros
├── ConversationListItem.tsx    → item individual da lista
├── ConversationFilters.tsx     → painel de filtros
├── ChatArea.tsx                → área principal de chat
├── MessageBubble.tsx           → bolha de mensagem individual
├── MessageInput.tsx            → campo de digitação + actions
├── TemplateSelector.tsx        → seletor de templates com busca
├── ContactPanel.tsx            → painel de informações do contato
├── TagSelector.tsx             → seletor de tags com autocomplete
├── InternalNotes.tsx           → notas internas da conversa
├── OperatorCard.tsx            → card do operador na visão supervisor
├── SupervisorGrid.tsx          → grid de operadores
├── ReportTable.tsx             → tabela de relatório com paginação
├── ReportFilters.tsx           → filtros de relatório
└── CSATWidget.tsx              → display de pontuação CSAT
```

---

## Endpoints REST

```
GET /dashboard/metrics            → métricas em tempo real
GET /dashboard/volume             → dados para gráfico de volume (?period=day|week|month)
GET /dashboard/operators          → status dos operadores (supervisor)

GET /reports/attendance           → relatório de volume de atendimento
GET /reports/response-time        → relatório de tempo de resposta
GET /reports/resolution           → relatório de taxa de resolução
GET /reports/csat                 → relatório de satisfação
GET /reports/operators            → relatório por operador
GET /reports/escalations          → relatório de escalações
GET /reports/:type/export         → exportar relatório (?format=csv|pdf)
```

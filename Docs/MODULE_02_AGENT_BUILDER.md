# Módulo 02 — Agent Builder (Builder Visual de Agentes de IA)

---

## Visão Geral

O Agent Builder é a funcionalidade central de diferenciação do AtendIA. Permite que qualquer pessoa — sem conhecimento técnico — configure um agente de IA personalizado para sua empresa em menos de 30 minutos, através de um wizard guiado passo a passo com ajuda contextual em cada campo.

---

## Interface de Configuração — Wizard Guiado

O wizard é dividido em 6 etapas, com barra de progresso visível e possibilidade de salvar e continuar depois.

### Etapa 1 — Identidade do Agente
- **Nome do agente** (ex: "Sofia", "Assistente Loja X")
  - `?` Tooltip: "Este é o nome que seus clientes verão. Escolha algo que combine com a identidade da sua empresa."
- **Avatar/foto do agente** (upload ou seleção de avatar padrão)
- **Descrição interna** (só para a equipe, não visível ao cliente)

### Etapa 2 — Personalidade e Tom de Voz
- **Tom de voz** (seleção visual com exemplo de frase):
  - 🤝 Formal: "Olá! Como posso auxiliá-lo hoje?"
  - 😊 Amigável: "Oi! Tudo bem? Em que posso te ajudar?"
  - 🔧 Técnico: "Olá. Descreva o problema para que eu possa diagnosticá-lo."
  - 🎉 Descontraído: "E aí! Qual é a boa? Me conta o que você precisa!"
- **Idioma principal** (PT-BR padrão)
- **Prompt de personalidade livre** (campo de texto avançado, ocultado por padrão)
  - `?` Tooltip: "Campo avançado. Descreva em texto livre como o agente deve se comportar, quais assuntos evitar, etc."

### Etapa 3 — Base de Conhecimento
Fontes de informação que o agente usará para responder:

- **Texto livre** — cole informações sobre sua empresa, produtos, políticas
  - `?` "Quanto mais detalhado, mais preciso será o agente. Inclua: descrição da empresa, produtos/serviços, preços, políticas de troca, horários."
- **Upload de PDF** — catálogos, manuais, políticas (máx. 10MB por arquivo, até 5 arquivos)
- **URL para scraping** — site da empresa, página de produtos
  - `?` "Informe o endereço do seu site. O agente irá ler o conteúdo público para aprender sobre sua empresa."
- **FAQ manual** — pergunta + resposta (pares adicionados manualmente)

### Etapa 4 — Regras de Escalação
Quando o agente deve chamar um operador humano:

- **Palavras-chave de escalação** (ex: "falar com humano", "atendente", "reclamação")
  - `?` "Se o cliente digitar qualquer uma dessas palavras, o agente transferirá para um operador."
- **Sentimento negativo detectado** (toggle on/off — usa análise de sentimento da IA)
- **Solicitação explícita do cliente** (toggle — sempre ativo)
- **Sem resolução após N tentativas** (slider: 1–5, padrão: 3)
- **Timeout** — escalação se cliente não responder em N minutos (desativado por padrão)
- **Mensagem de escalação** — texto enviado ao cliente ao transferir
  - `?` "Ex: 'Vou transferir você para um de nossos atendentes. Um momento!'"

### Etapa 5 — Horários de Atendimento
- **Configuração por dia da semana** (segunda a domingo, on/off + horário início/fim)
- **Fuso horário** da empresa
- **Mensagem fora do horário** — enviada quando o cliente contata fora do horário configurado
  - `?` "Ex: 'Nosso horário de atendimento é de segunda a sexta, das 9h às 18h. Deixe sua mensagem que retornaremos assim que possível!'"
- **Atender fora do horário com o agente IA?** (toggle — o agente pode continuar respondendo mesmo fora do horário)

### Etapa 6 — Preview e Ativação
- Chat de preview em tempo real no lado direito da tela
- Usuário pode testar perguntas e ver as respostas do agente configurado
- Botão "Ativar Agente" publica o agente
- Botão "Salvar Rascunho" salva sem publicar

---

## Sistema de Ajuda Contextual

Cada campo possui:
- **Ícone `?`** ao lado do label que abre tooltip ao hover/click
- **Tooltips curtos** (máx. 2 linhas) com explicação objetiva
- **Link "Saiba mais"** em alguns campos, abrindo modal com explicação detalhada + exemplo
- **Mensagens de validação amigáveis** (não técnicas): "A base de conhecimento parece vazia. Adicione pelo menos um texto para que o agente possa responder seus clientes."

---

## Preview em Tempo Real

- Painel lateral mostra simulação do chat
- Cada mudança de configuração recarrega o preview (debounce de 800ms)
- O preview usa a IA real (com limite de tokens para não gerar custo excessivo)
- Badge "SIMULAÇÃO" visível para distinguir do chat real
- Botão para limpar o histórico do preview e recomeçar

---

## Processamento da Base de Conhecimento

```
Upload PDF → extração de texto (pdfjs/tesseract para scanned)
URL → scraping com cheerio/puppeteer → extração de conteúdo principal
Texto livre → chunking por parágrafos

Todos os chunks → embedding (OpenAI text-embedding-3-small)
             → armazenado no pgvector (extensão PostgreSQL)

Em runtime:
  mensagem do cliente → embedding da mensagem
                     → busca por similaridade no pgvector
                     → top 5 chunks relevantes
                     → incluídos no contexto do prompt
```

---

## Estrutura de Dados do Agente no Banco

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  description TEXT,
  tone VARCHAR(50) DEFAULT 'friendly'
    CHECK (tone IN ('formal','friendly','technical','casual')),
  language VARCHAR(10) DEFAULT 'pt-BR',
  persona_prompt TEXT,                    -- prompt de personalidade
  escalation_rules JSONB DEFAULT '{
    "keywords": [],
    "negative_sentiment": true,
    "explicit_request": true,
    "max_attempts": 3,
    "escalation_message": "Vou transferir você para um atendente."
  }',
  schedule JSONB DEFAULT '{
    "timezone": "America/Sao_Paulo",
    "attend_outside_hours": false,
    "hours": {
      "mon": {"active": true, "start": "09:00", "end": "18:00"},
      "tue": {"active": true, "start": "09:00", "end": "18:00"},
      "wed": {"active": true, "start": "09:00", "end": "18:00"},
      "thu": {"active": true, "start": "09:00", "end": "18:00"},
      "fri": {"active": true, "start": "09:00", "end": "18:00"},
      "sat": {"active": false},
      "sun": {"active": false}
    },
    "out_of_hours_message": "Nosso horário de atendimento é..."
  }',
  is_active BOOLEAN DEFAULT false,
  is_draft BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fontes da base de conhecimento
CREATE TABLE knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type VARCHAR(50) CHECK (type IN ('text','pdf','url','faq')),
  title VARCHAR(255),
  content TEXT,                   -- texto extraído
  source_url TEXT,                -- se type = url
  file_url TEXT,                  -- se type = pdf
  status VARCHAR(50) DEFAULT 'processing'
    CHECK (status IN ('processing','ready','error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks de embedding
CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),         -- pgvector
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops);

-- FAQs
CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Endpoints da API

```
GET    /agents                    → listar agentes da empresa
GET    /agents/:id                → buscar agente
POST   /agents                    → criar agente
PUT    /agents/:id                → atualizar agente
DELETE /agents/:id                → deletar agente
POST   /agents/:id/activate       → ativar agente
POST   /agents/:id/deactivate     → desativar agente
POST   /agents/:id/preview        → chat de preview (retorna resposta da IA)

POST   /agents/:id/knowledge      → adicionar fonte de conhecimento
DELETE /agents/:id/knowledge/:kid → remover fonte
GET    /agents/:id/knowledge      → listar fontes

POST   /agents/:id/faqs           → criar FAQ
PUT    /agents/:id/faqs/:fid      → editar FAQ
DELETE /agents/:id/faqs/:fid      → remover FAQ
GET    /agents/:id/faqs           → listar FAQs
```

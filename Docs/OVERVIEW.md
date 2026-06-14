# AtendIA — Visão Geral do Projeto

> ⚠️ **AVISO DE CONTINUIDADE — CLAUDE CODE**
> Este arquivo deve ser lido no início de cada sessão de trabalho para retomar o projeto de onde parou.
> Ordem de leitura recomendada: `PROGRESS.md` → `OVERVIEW.md` → `ARCHITECTURE.md` → módulo em desenvolvimento.

---

## O que é o AtendIA?

AtendIA é uma plataforma de **multi-atendimento inteligente** que combina agentes de Inteligência Artificial com intervenção humana em tempo real. O sistema permite que empresas automatizem seu atendimento ao cliente via WhatsApp e outros canais de comunicação, com a segurança de que um operador humano pode assumir qualquer conversa a qualquer momento.

O projeto é desenvolvido em **duas versões paralelas e complementares**:

---

## Os Dois Produtos

### 1. AtendIA Web (SaaS)
Plataforma hospedada na nuvem, acessível via navegador, com modelo de assinatura mensal. Ideal para empresas que querem começar rapidamente sem infraestrutura própria.

- Acesso via URL (ex: `app.atend-ia.com`)
- Multi-tenant: cada empresa tem seu espaço isolado
- Planos: Free, Starter, Pro, Enterprise
- Atualizações automáticas e sem intervenção do cliente
- Escalável conforme crescimento da empresa

### 2. AtendIA Desktop (.exe)
Versão empacotada com Electron, distribuída como instalador Windows. O cliente compra um serial, baixa o `.exe` e ativa localmente. Ideal para empresas que preferem dados locais ou têm restrições de acesso à internet.

- Instalação local na máquina do cliente
- Licenciamento por serial único (formato `ATND-XXXX-XXXX-XXXX-XXXX`)
- Funcionalidade parcialmente offline
- Banco de dados SQLite local
- Planos: Mensal, Trimestral, Semestral, Anual

---

## O Problema que Resolve

Empresas de pequeno e médio porte enfrentam o desafio de atender um volume crescente de mensagens no WhatsApp sem aumentar proporcionalmente sua equipe. As soluções existentes ou são caras demais (APIs oficiais do WhatsApp Business) ou são complexas de configurar (n8n, ManyChat), ou não permitem que um humano assuma a conversa de forma fluida.

**O AtendIA resolve isso com:**

- **Agente de IA configurável sem código**: o próprio dono do negócio configura a personalidade, o conhecimento e as regras do agente via interface visual intuitiva.
- **Takeover humano em tempo real**: um operador assume a conversa com um clique, e o agente para imediatamente de responder.
- **WhatsApp Web como canal principal**: sem necessidade de API oficial do WhatsApp Business (que exige aprovação e tem custo elevado).
- **Histórico unificado**: toda a conversa — incluindo o que o agente respondeu — fica registrada e visível para os operadores.

---

## Canais Suportados

| Canal | Status | Método de Conexão |
|---|---|---|
| WhatsApp Web | ✅ Principal | Biblioteca Baileys (QR Code) |
| Chat no Site | 🔜 Fase 7 | Widget JavaScript embedável |
| Instagram DM | 🔜 Fase 7 | Meta API oficial |
| Telegram | 🔜 Fase 7 | Telegram Bot API |
| Facebook Messenger | 🔜 Futuro | Meta API oficial |

A arquitetura é projetada para ser extensível: novos canais são adicionados como plugins ao motor de chat central.

---

## Perfis de Usuário

### Super Admin (AtendIA)
Acesso total ao sistema. Gerencia todos os tenants, licenças e configurações globais. Apenas a equipe interna do AtendIA.

### Admin da Empresa
Dono ou gestor da empresa cliente. Configura o agente, gerencia operadores, visualiza relatórios, define planos de atendimento e integrações.

### Supervisor
Membro da equipe com acesso à supervisão de todos os operadores e conversas. Pode intervir em qualquer atendimento, gerar relatórios e configurar regras.

### Operador
Atendente humano. Visualiza as conversas que foram escaladas para humano, assume atendimentos, responde clientes e encerra conversas.

### Configurador do Agente
Perfil especializado para quem configura o agente de IA sem necessariamente ter acesso aos atendimentos. Pode editar base de conhecimento, fluxos e personalidade do agente.

---

## Diferenciais do Sistema

### Configuração Intuitiva sem Código
O Agent Builder utiliza um wizard guiado passo a passo. Qualquer pessoa, mesmo sem conhecimento técnico, consegue configurar um agente funcional em menos de 30 minutos.

### Sistema de Ajuda Contextual
Cada campo da interface possui um ícone de ajuda (`?`) com tooltip explicativo e, em alguns casos, link para documentação mais detalhada. O usuário nunca fica perdido.

### Takeover Humano em Tempo Real
Quando um operador clica em "Assumir Atendimento", o agente recebe um sinal via WebSocket e **para de responder imediatamente**. A transição é imperceptível para o cliente final.

### Widget Embedável
Um script JavaScript de uma linha pode ser adicionado a qualquer site ou sistema para abrir um chat com o AtendIA. Suporta personalização visual via parâmetros.

### Arquitetura Multi-tenant Segura
No SaaS, cada empresa tem seus dados completamente isolados. Não há risco de vazamento de dados entre clientes. Cada tenant possui seu próprio schema ou conjunto de registros identificados por `company_id`.

---

## Avisos de Continuidade para Claude Code

```
IMPORTANTE: Se você está lendo este arquivo, provavelmente está iniciando ou retomando
uma sessão de desenvolvimento do AtendIA.

Siga esta ordem obrigatória:
1. Leia docs/PROGRESS.md — estado atual do projeto
2. Leia este arquivo (OVERVIEW.md) — visão geral
3. Leia docs/ARCHITECTURE.md — decisões técnicas
4. Leia o arquivo do módulo em que está trabalhando

Nunca reescreva código já funcional sem antes verificar o que existe.
Sempre atualize docs/PROGRESS.md ao final de cada sessão.
```

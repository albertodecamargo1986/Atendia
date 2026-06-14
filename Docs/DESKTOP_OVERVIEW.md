# AtendIA Desktop — Visão Geral

---

## O que é a Versão Desktop?

A versão Desktop do AtendIA é uma aplicação empacotada com **Electron** que contém o mesmo core da versão web, mas executando localmente na máquina do cliente. O usuário instala um arquivo `.exe`, ativa com um serial recebido por e-mail após a compra, e usa a aplicação sem necessidade de manter um servidor próprio ou acessar via navegador.

---

## Arquitetura Técnica

```
┌─────────────────────────────────────────────────┐
│                  Electron Shell                  │
│                                                  │
│  ┌──────────────────┐   ┌──────────────────┐    │
│  │  Renderer Process │   │   Main Process   │    │
│  │  (React/Frontend) │   │   (Node.js)      │    │
│  │                  │   │                  │    │
│  │  Mesma UI do SaaS│◄──►  Backend Express │    │
│  │  (adaptada)      │   │  Socket.io       │    │
│  └──────────────────┘   │  Baileys         │    │
│                          │  BullMQ (mem)    │    │
│                          └────────┬─────────┘    │
│                                   │              │
│                          ┌────────▼─────────┐    │
│                          │   SQLite (local)  │    │
│                          │   better-sqlite3  │    │
│                          └──────────────────┘    │
└────────────────────────────┬────────────────────┘
                             │ (opcional)
                    ┌────────▼────────┐
                    │  API AtendIA    │
                    │  (validação de  │
                    │   licença,      │
                    │   sync cloud)   │
                    └─────────────────┘
```

---

## Vantagens da Versão Desktop

### Instalação Simples
- Um arquivo `.exe` com instalador (NSIS)
- Não requer Docker, Node.js, PostgreSQL ou qualquer configuração técnica
- Wizard de instalação guiado (próximo, próximo, instalar)
- Atalho na área de trabalho e no menu Iniciar

### Funcionamento Parcialmente Offline
- Histórico de conversas disponível sem internet
- Configurações e base de conhecimento do agente: locais
- Envio e recebimento de mensagens: requer internet (WhatsApp Web)
- Validação de licença: requer internet periodicamente (tolerância de 7 dias)

### Dados Locais
- Banco de dados SQLite na máquina do cliente
- Cliente tem controle total sobre seus dados
- Backup manual da pasta de dados
- Sem risco de perda de dados por encerramento do serviço cloud

### Conexão WhatsApp Mais Estável
- Processo Baileys rodando localmente tem menos latência
- Menos dependente de infraestrutura de terceiros
- Reconexão mais rápida por estar na mesma rede que o dispositivo

---

## Modelo de Negócio

### Fluxo de Compra
```
1. Cliente acessa atend-ia.com/desktop
2. Escolhe o plano (Mensal, Trimestral, Semestral, Anual)
3. Realiza o pagamento (cartão, PIX, boleto)
4. Recebe e-mail com:
   - Serial de ativação (ATND-XXXX-XXXX-XXXX-XXXX)
   - Link para download do instalador (.exe)
   - Link para documentação
5. Instala o .exe e ativa com o serial
6. Usa o sistema normalmente
```

### Planos Disponíveis

| Plano | Duração | Preço | Desconto |
|---|---|---|---|
| Mensal | 30 dias | R$ 147/mês | — |
| Trimestral | 90 dias | R$ 127/mês | 14% |
| Semestral | 180 dias | R$ 107/mês | 27% |
| Anual | 365 dias | R$ 87/mês | 41% |

**Incluído em todos os planos:**
- Operadores ilimitados (uso interno da empresa)
- 1 número de WhatsApp
- Agente de IA (requer chave de API OpenAI/Anthropic do próprio cliente)
- Conversas ilimitadas
- Suporte por e-mail

---

## Limitações em Relação à Versão Web SaaS

| Funcionalidade | SaaS Web | Desktop |
|---|---|---|
| Multi-tenant | ✅ | ❌ (mono-empresa) |
| Acesso via browser | ✅ | ❌ (apenas local) |
| Múltiplos números WA | Conforme plano | 1 número |
| Faturamento automático | ✅ | Manual/serial |
| Atualizações automáticas | ✅ | Via auto-updater |
| Backup automático na nuvem | ✅ | Manual (local) |
| API pública | ✅ | Versão limitada |
| Widget embedável | ✅ | ❌ |
| Múltiplos usuários simultâneos | ✅ | Até 5 localmente |
| Acesso remoto | ✅ | VPN necessária |

---

## Arquitetura Electron + SQLite

### Processos do Electron
- **Main Process:** Node.js puro — backend Express, Baileys, Socket.io, SQLite
- **Renderer Process:** Chromium — React app (mesma codebase do web, adaptada)
- **Comunicação:** IPC (Inter-Process Communication) para operações sensíveis (licença, sistema de arquivos)

### SQLite com better-sqlite3
- Banco local em `%APPDATA%\AtendIA\database.db` (Windows)
- Schemas idênticos ao PostgreSQL (com adaptações menores)
- Migrações gerenciadas via `db-migrate` ou scripts customizados
- WAL mode ativo para melhor performance em leituras concorrentes

### Pasta de Dados do Usuário
```
%APPDATA%\AtendIA\
├── database.db         → banco SQLite principal
├── database.db-wal     → WAL do SQLite
├── sessions/           → credenciais WhatsApp (criptografadas)
├── media/              → arquivos de mídia recebidos
├── logs/               → logs da aplicação
└── config.json         → configurações da aplicação
```

### Sincronização Opcional com Nuvem
Para clientes que desejam backup na nuvem ou acesso remoto:
- Toggle em Configurações → Sincronização → Ativar Sync
- Backup incremental para S3/Google Drive pessoal do cliente
- Somente leitura da nuvem (dados locais sempre primários)

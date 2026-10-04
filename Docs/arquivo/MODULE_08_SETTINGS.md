# Módulo 08 — Configurações da Plataforma

---

## Visão Geral

O módulo de Configurações centraliza todas as personalizações e administração da conta da empresa. Acessível por admins e supervisores (com permissões limitadas).

---

## 1. Configurações Gerais da Empresa

### Identidade Visual
- **Nome da empresa** — exibido no painel e no widget de chat
- **Logo** — upload (PNG/SVG, máx 2MB) — exibida no widget e e-mails
- **Cor primária** — cor do widget e elementos de destaque (color picker + código hex)
- **Site da empresa** — URL exibida em e-mails automáticos
- **Descrição curta** — usada em e-mails e página de suporte

### Localização
- **Timezone** — fuso horário principal da empresa (afeta relatórios e horários)
- **Idioma da interface** — PT-BR, EN, ES
- **Formato de data** — DD/MM/YYYY ou MM/DD/YYYY

### Contato da Empresa
- E-mail de suporte (exibido ao cliente quando necessário)
- Telefone principal
- Endereço (para notas fiscais e compliance)

---

## 2. Gestão de Usuários e Permissões

### Lista de Usuários
Tabela com: nome, e-mail, perfil, status (ativo/inativo), último acesso, ações.

### Ações Disponíveis (Admin)
- Convidar novo usuário (e-mail + perfil)
- Editar perfil de um usuário
- Ativar/desativar usuário (desativação não apaga dados)
- Resetar senha de um usuário
- Ver log de atividades do usuário

### Perfis e Permissões
Tabela visual de permissões por perfil (ver Módulo 01 para detalhes).
Admins podem criar **perfis customizados** no plano Enterprise.

---

## 3. Horários de Atendimento e Feriados

### Configuração de Horários
- Configuração por dia da semana (on/off + horário início/fim)
- Múltiplos turnos por dia (ex: 9h-12h e 14h-18h)
- Fuso horário herdado das configurações gerais

### Feriados e Exceções
- Calendário de feriados nacionais (importável automaticamente)
- Feriados customizados (datas específicas + nome)
- Para cada feriado: opção de fechar totalmente ou ter horário reduzido

### Mensagens Automáticas por Situação
- **Fora do horário:** mensagem enviada quando cliente contata fora do expediente
- **Feriado:** mensagem específica para feriados
- **Todos os operadores ausentes:** mensagem quando todos estão offline
- **Alta demanda:** mensagem de boas-vindas quando há fila longa

---

## 4. Mensagens de Ausência e Automáticas

Todas as mensagens são configuradas com suporte a **variáveis dinâmicas**:

| Variável | Substituído por |
|---|---|
| `{{nome_cliente}}` | Nome do contato (se conhecido) |
| `{{horario_abertura}}` | Próximo horário de abertura |
| `{{tempo_espera}}` | Estimativa de tempo na fila |
| `{{nome_empresa}}` | Nome da empresa |
| `{{nome_operador}}` | Nome do operador atribuído |

### Mensagem de Ausência Padrão
```
Olá, {{nome_cliente}}! 👋

No momento estamos fora do horário de atendimento.
Nosso horário é de segunda a sexta, das 9h às 18h.
Voltaremos a partir de {{horario_abertura}}.

Sua mensagem foi registrada e entraremos em contato em breve!
```

---

## 5. Blacklist de Contatos

- Lista de números bloqueados (não recebem atendimento)
- Motivo do bloqueio (spam, solicitação, abuso)
- Data de adição e quem adicionou
- Possibilidade de desbloquear a qualquer momento
- Import em massa via CSV

**Comportamento:** quando número bloqueado envia mensagem, o sistema:
- Opção A: ignora silenciosamente
- Opção B: responde mensagem de bloqueio configurada
- Opção C: apenas registra sem responder

---

## 6. Configuração de Notificações

### Por Canal de Notificação
| Canal | Configurável por | Tipos de evento |
|---|---|---|
| **E-mail** | Admin | Novos usuários, erros críticos, relatórios semanais |
| **Push (browser)** | Cada operador | Nova mensagem, nova conversa, escalação |
| **Som** | Cada operador | Ativar/desativar + escolha do som + volume |
| **SMS** | Admin (opcional) | Somente escalações críticas |

### Configurações de Som por Operador
- Ativar/desativar sons globalmente
- Som para: nova mensagem, nova conversa na fila, escalação urgente, takeover
- Biblioteca de sons disponíveis (ou upload customizado)
- Controle de volume
- Modo "não perturbe" por horário

---

## 7. Backup e Exportação de Dados

### Exportação Manual
- **Conversas:** CSV com todas as conversas (com ou sem mensagens) por período
- **Contatos:** CSV com todos os contatos e histórico
- **Relatórios:** PDF dos relatórios principais
- **Configurações:** JSON completo das configurações (para migração)

### Backup Automático
- Frequência: diária (para banco) e semanal (para arquivos de mídia)
- Armazenamento: S3 ou Google Cloud Storage
- Retenção: 30 dias (Starter), 90 dias (Pro), 1 ano (Enterprise)
- Notificação de sucesso/falha por e-mail

### Restauração
Apenas pelo suporte do AtendIA (para evitar sobrescrita acidental).

---

## 8. Privacidade e LGPD

### Configurações de Retenção de Dados
- **Retenção de conversas:** configurável (90 dias padrão, até "indefinido" no Enterprise)
- **Retenção de mídias:** configurável (30 dias padrão)
- **Anonimização automática:** após período configurado, dados do contato são anonimizados

### Direitos do Titular (LGPD)
Interface para processar solicitações de titulares:
- **Acesso:** exportar todos os dados de um contato específico
- **Correção:** editar dados de um contato
- **Exclusão:** apagar todos os dados de um contato (com confirmação e registro da solicitação)
- **Portabilidade:** exportar em formato padrão

### Configurações de Cookies (Widget)
- Consentimento de cookies antes de iniciar o chat (toggle)
- Texto customizável do aviso de cookies
- Link para política de privacidade da empresa

### Log de Auditoria
- Registro de todas as ações sensíveis: login, exportação, deleção, mudança de permissões
- Imutável (append-only)
- Acessível por admins por 1 ano

---

## 9. Plano de Assinatura e Faturamento

### Informações do Plano Atual
- Plano atual com data de renovação
- Uso atual vs. limites (conversas, operadores, requisições de IA)
- Barra de progresso visual de cada limite

### Upgrade/Downgrade
- Comparativo de planos com botão de upgrade
- Upgrade com efeito imediato + cobrança proporcional
- Downgrade aplicado na próxima renovação

### Histórico de Faturas
- Lista de faturas com status (pago, pendente, falhou)
- Download de nota fiscal/recibo
- Dados de cobrança (CNPJ, endereço)

### Método de Pagamento
- Cartão de crédito (via Stripe)
- PIX (via Mercado Pago)
- Boleto bancário (planos anuais)

---

## Endpoints da API

```
GET    /settings/general              → configurações gerais
PUT    /settings/general              → atualizar configurações gerais
GET    /settings/schedule             → configuração de horários
PUT    /settings/schedule             → atualizar horários
GET    /settings/holidays             → feriados
POST   /settings/holidays             → adicionar feriado
DELETE /settings/holidays/:id         → remover feriado
GET    /settings/messages             → mensagens automáticas
PUT    /settings/messages             → atualizar mensagens
GET    /settings/blacklist            → lista negra
POST   /settings/blacklist            → adicionar contato
DELETE /settings/blacklist/:id        → remover da lista negra
GET    /settings/notifications        → configurações de notificação
PUT    /settings/notifications        → atualizar notificações
GET    /settings/billing              → informações de plano e fatura
GET    /settings/billing/invoices     → histórico de faturas
POST   /settings/billing/upgrade      → solicitar upgrade de plano
GET    /settings/export               → exportar dados
POST   /settings/export               → solicitar exportação
GET    /settings/audit-log            → log de auditoria
```

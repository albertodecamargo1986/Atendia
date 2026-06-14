# AtendIA Desktop — Módulos e Adaptações

---

## Módulos Presentes na Versão Desktop

| Módulo | Versão Web | Versão Desktop | Observações |
|---|---|---|---|
| Autenticação | ✅ Completo | ✅ Adaptado | Sem multi-tenant; login local simples |
| Agent Builder | ✅ Completo | ✅ Completo | Idêntico à versão web |
| Motor de Chat | ✅ Completo | ✅ Adaptado | Socket.io local; sem distribuição entre operadores |
| Integração WhatsApp | ✅ Completo | ✅ Completo | Idêntico; 1 número por padrão |
| Takeover Humano | ✅ Completo | ✅ Adaptado | Sem transferência entre operadores remotos |
| Dashboard | ✅ Completo | ✅ Adaptado | Sem métricas de equipe |
| Relatórios | ✅ Completo | ✅ Completo | Exportação local (pasta Downloads) |
| Widget Embedável | ✅ Completo | ❌ Ausente | Requer servidor público |
| API Pública | ✅ Completo | ⚡ Limitado | API local apenas para integrações locais |
| Webhooks | ✅ Completo | ⚡ Limitado | Funciona se destino for acessível pela rede |
| Configurações Gerais | ✅ Completo | ✅ Adaptado | Sem faturamento |
| Multi-tenant | ✅ Completo | ❌ Ausente | Mono-empresa por design |
| Faturamento/Assinatura | ✅ Completo | ❌ Ausente | Gerenciado pelo portal web |
| Licenciamento | ❌ Ausente | ✅ Exclusivo | Sistema de serial único do desktop |

---

## Adaptações por Módulo

### Módulo de Autenticação (Adaptado)
**Remoções:**
- Cadastro de nova empresa (empresa já configurada na instalação)
- Convite de usuários por e-mail (convite local via link)
- Recuperação de senha por e-mail → substituído por PIN de recuperação local

**Adições:**
- Tela de ativação de licença (primeiro uso)
- Configuração do perfil de administrador local no onboarding
- Acesso por PIN rápido (opcional, para desbloqueio rápido da sessão)

**Implementação:**
```typescript
// Sem JWT complexo — autenticação local simples
// Sessão mantida em electron-store
// Timeout de sessão configurável (padrão: 8h sem atividade)
```

---

### Motor de Chat (Adaptado)
**Diferenças:**
- Socket.io roda localmente (sem necessidade de servidor externo)
- Distribuição de conversas entre operadores é simplificada (máx. 5 usuários simultâneos)
- Filas processadas em memória (sem Redis) para instalações simples

**Para instalações com múltiplos usuários:**
- Modo "servidor local": um computador roda o app em modo servidor
- Outros computadores na mesma rede acessam via IP local
- Não recomendado para mais de 5 usuários simultâneos

---

### Dashboard (Adaptado)
**Remoções:**
- Painel de supervisão de equipe (sem contexto multi-operador)
- Métricas de desempenho por operador (sem equipe)

**Mantidos:**
- Cards de métricas em tempo real
- Gráficos de volume
- CSAT
- Todos os relatórios individuais

---

### Configurações Específicas do Desktop

#### Aba: Pasta de Dados
```
Local dos dados:
  C:\Users\João\AppData\Roaming\AtendIA\
  [Alterar pasta]  [Abrir no Explorer]

Uso de disco:
  Banco de dados:  45 MB
  Arquivos de mídia: 230 MB
  Logs:  12 MB
  Total:  287 MB

  [Limpar logs antigos]  [Limpar mídias antigas (>30 dias)]
```

#### Aba: Backup Local
```
Backup automático:
  [✓] Ativar backup automático
  Frequência: [Diário ▼]
  Hora: [02:00]
  Manter: [30 ▼] backups

Pasta de backup:
  C:\Users\João\Documents\AtendIA Backup\
  [Alterar]

Último backup: 25/01/2025 às 02:00 ✅
[Fazer backup agora]  [Restaurar backup...]
```

#### Aba: Rede e Proxy
```
Conexão com a internet:
  Status: ✅ Conectado

Proxy:
  [  ] Usar proxy
  Servidor: ___________  Porta: _____
  [ ] Proxy requer autenticação
  Usuário: _______  Senha: _______

DNS personalizado:
  [ ] Usar DNS personalizado
  Servidor: ___________
```

#### Aba: Inicialização
```
[ ✓ ] Iniciar AtendIA com o Windows
[ ✓ ] Iniciar minimizado na bandeja do sistema
[ ✓ ] Mostrar ícone na bandeja do sistema
[ ✓ ] Fechar para a bandeja (não encerrar)
```

---

## Diferenças de UX — Web vs. Desktop

### Menu de Navegação
- **Web:** sidebar esquerda com ícones e textos
- **Desktop:** menu nativo do sistema operacional (File, Edit, View, Help) + sidebar simplificada

### Notificações
- **Web:** notificações do browser (push) + badge na aba
- **Desktop:** notificações nativas do Windows (Action Center) + ícone na bandeja

### Upload de Arquivos
- **Web:** drag & drop ou seletor de arquivo do browser
- **Desktop:** drag & drop + acesso direto ao sistema de arquivos do Windows (mais rápido)

### Atalhos de Teclado (exclusivos do desktop)
| Atalho | Ação |
|---|---|
| `Ctrl+N` | Nova nota interna |
| `Ctrl+Enter` | Enviar mensagem |
| `Ctrl+T` | Assumir atendimento |
| `Ctrl+R` | Encerrar conversa |
| `Ctrl+F` | Buscar nas conversas |
| `Ctrl+,` | Abrir configurações |
| `F11` | Tela cheia |
| `Ctrl+Q` | Fechar para a bandeja |

### Ícone na Bandeja do Sistema
Ao fechar a janela, o app permanece ativo na bandeja:
- Ícone normal: operando normalmente
- Ícone com badge vermelho: há conversas aguardando
- Click direito: menu rápido (Abrir, Status, Sair)
- Double click: restaurar a janela

### Modo Escuro / Claro
- Segue automaticamente a preferência do sistema operacional
- Pode ser sobrescrito manualmente em Configurações → Aparência

---

## Módulos Exclusivos do Desktop

### Módulo de Licença
- Tela de ativação no primeiro uso
- Verificação periódica silenciosa
- Alertas de expiração
- Interface de transferência de licença
- Modo restrito após expiração

### Módulo de Atualização
- Verificação automática de novas versões
- Download em background
- Notificação quando atualização está pronta
- Instalação com um clique (reinicia o app)
- Rollback automático se nova versão falhar ao iniciar

### Módulo de Diagnóstico
Acesso via Help → Diagnóstico:
- Status de todos os serviços (SQLite, Baileys, AI API)
- Uso de memória e CPU
- Tamanho do banco de dados
- Log de erros recentes
- Botão "Copiar diagnóstico" (para enviar ao suporte)
- Botão "Resetar banco de dados" (com confirmação dupla)

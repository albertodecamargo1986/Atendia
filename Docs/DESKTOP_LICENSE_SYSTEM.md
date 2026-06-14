# AtendIA Desktop — Sistema de Licenciamento

---

## Formato do Serial

```
ATND-XXXX-XXXX-XXXX-XXXX
```

- **ATND:** prefixo fixo do produto
- **XXXX-XXXX-XXXX-XXXX:** 16 caracteres alfanuméricos (A-Z, 0-9, sem ambíguos: O/0, I/1/L)
- Total: 24 caracteres (sem os hifens)
- Gerado com criptografia (não sequencial)

### Geração do Serial
```typescript
function generateSerial(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem ambíguos
  const segments = 4;
  const segmentLength = 4;

  const parts = Array.from({ length: segments }, () =>
    Array.from({ length: segmentLength }, () =>
      chars[crypto.randomInt(chars.length)]
    ).join('')
  );

  return `ATND-${parts.join('-')}`;
}
```

---

## Validação do Serial

### Validação Online (padrão)
```typescript
// Desktop → API AtendIA
POST https://api.atend-ia.com/v1/licenses/validate
{
  "serial": "ATND-XXXX-XXXX-XXXX-XXXX",
  "hwid": "a3f8c2d1e4b7...",  // hash do hardware
  "version": "1.5.0"
}

// Resposta
{
  "valid": true,
  "plan": "annual",
  "expires_at": "2025-12-31T23:59:59Z",
  "features": ["ai_agent", "whatsapp", "reports"],
  "transfer_token": "eyJ..."  // para uso offline
}
```

### Validação Offline (sem internet)
Para uso em ambientes sem acesso constante à internet:

1. No momento da ativação online, o servidor gera um **token de validação local** assinado com Ed25519
2. Este token é armazenado localmente e contém: serial, hwid, plano, data de expiração, assinatura
3. Em modo offline, o app verifica a assinatura do token localmente (sem chamar a API)
4. Tolerância offline: 7 dias antes de exigir verificação online

```typescript
// Token de validação local (formato JWT)
{
  "sub": "ATND-XXXX-XXXX-XXXX-XXXX",
  "hwid": "a3f8c2d1e4b7...",
  "plan": "annual",
  "exp": 1767225600,   // Unix timestamp
  "features": ["ai_agent", "whatsapp"],
  "iat": 1704067200,
  "iss": "atend-ia-license-server"
}
// Assinado com chave privada Ed25519 do servidor AtendIA
// App possui apenas a chave pública — não pode falsificar tokens
```

---

## HWID — Hardware ID

Identificador único da máquina, gerado a partir de múltiplos componentes:

```typescript
async function generateHWID(): Promise<string> {
  const components = [
    await getMachineId(),       // ID único do Windows/macOS/Linux
    os.cpus()[0].model,         // modelo do processador
    os.totalmem().toString(),   // total de memória RAM
    // Volume serial do disco C: (via PowerShell no Windows)
  ];

  return crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex');
}
```

O HWID é registrado no banco do servidor na primeira ativação. Mudanças menores de hardware (trocar RAM, adicionar disco) **não invalidam** a licença. Troca da placa-mãe ou reinstalação do Windows **pode** invalidar — para isso existe o sistema de transferência.

---

## Tela de Ativação (Primeiro Uso)

```
┌──────────────────────────────────────────────┐
│          AtendIA — Ativar Licença            │
│                                              │
│  Digite o serial recebido por e-mail:        │
│  ┌────────────────────────────────────────┐  │
│  │  ATND - ____ - ____ - ____ - ____     │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  [  Ativar Licença  ]  [ Comprar Agora ]     │
│                                              │
│  ✓ Funciona offline após ativação inicial    │
│  ✓ Suporte 7 dias offline sem reconexão      │
│                                              │
│  Problemas? suporte@atend-ia.com             │
└──────────────────────────────────────────────┘
```

**Fluxo de ativação:**
1. Usuário insere o serial
2. App gera o HWID da máquina
3. Chama API de ativação (precisa de internet apenas neste momento)
4. Se serial válido e não ativado: ativa, salva token local, abre app
5. Se serial já ativado em outra máquina: oferece opção de transferência

---

## Verificação Periódica da Licença

| Situação | Ação |
|---|---|
| Online (padrão) | Verificação diária silenciosa em background |
| Offline há < 7 dias | Usa token local — funciona normalmente |
| Offline há 7 dias | Alerta: "Conecte-se à internet para validar a licença" |
| Offline há > 7 dias | Modo restrito (somente leitura) |
| Licença expirada | Ver seção de bloqueio |

### Verificação em Background
```typescript
// Executado na inicialização do app e depois a cada 24h
async function checkLicenseInBackground() {
  try {
    const response = await validateOnline(serial, hwid);
    await saveLocalToken(response.transfer_token);
    store.set('license', { ...response, lastCheck: Date.now() });
  } catch (error) {
    // Offline: usa token local se dentro da tolerância
    const lastCheck = store.get('license.lastCheck');
    const offlineDays = (Date.now() - lastCheck) / (1000 * 60 * 60 * 24);

    if (offlineDays > 7) {
      setRestrictedMode(true);
    }
  }
}
```

---

## Alertas de Expiração

| Antecedência | Mensagem | Frequência |
|---|---|---|
| 30 dias | Banner informativo no topo: "Sua licença expira em 30 dias. Renove para não perder o acesso." | 1x por dia |
| 7 dias | Banner amarelo + notificação push: "Sua licença expira em 7 dias!" | 1x por dia |
| 1 dia | Banner vermelho + modal ao abrir: "Sua licença expira amanhã. Renove agora!" | Ao iniciar app |
| Expirado | Modal bloqueante com botão de renovação | Ao iniciar app |

---

## Bloqueio Após Expiração

### Fase 1 — Bloqueio Suave (dias 1–7 após expiração)
- App abre normalmente mas com banner vermelho persistente
- Operações de escrita bloqueadas (não pode responder clientes)
- Somente leitura: histórico de conversas, relatórios, configurações
- Botão de renovação proeminente em todas as telas

### Fase 2 — Bloqueio Total (após 7 dias de expiração)
- App não abre sem renovação
- Tela de bloqueio com: mensagem, preço para renovar, botão de pagamento
- Dados **não são apagados** (cliente pode renovar e recuperar tudo)

```typescript
function checkAccessLevel(): 'full' | 'readonly' | 'blocked' {
  const { expires_at, is_active } = getLicenseInfo();

  if (!is_active) return 'blocked';

  const now = new Date();
  const expiry = new Date(expires_at);

  if (now < expiry) return 'full';

  const daysSinceExpiry = (now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceExpiry <= 7) return 'readonly';

  return 'blocked';
}
```

---

## Sistema de Transferência de Licença

Cliente pode transferir a licença para outra máquina (ex: trocou de computador):

**Limite:** 2 transferências por ano (reinicia em 12 meses após a ativação inicial)

### Fluxo de Transferência
```
Cliente acessa: app.atend-ia.com/minha-conta/licencas
Clica em "Transferir licença"
Confirma que entende que a máquina atual será desativada
Gera "Token de Transferência" (válido por 24h)
Instala o app na nova máquina
Ativa com: Serial + Token de Transferência
```

### Casos de Uso Permitidos
- Troca de computador
- Reinstalação do Windows
- Upgrade de hardware (placa-mãe nova)

### Prevenção de Abuso
- Máximo 2 transferências por ano (contado a partir da data de ativação)
- Token de transferência expira em 24h
- Log de todas as transferências com IP e HWID anterior/novo
- Alerta por e-mail ao cliente quando transferência é realizada
- Suporte pode bloquear serial suspeito de compartilhamento

---

## Painel de Licenças do Cliente

Acessível em `app.atend-ia.com/minha-conta`:

```
Minhas Licenças
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Serial: ATND-A1B2-C3D4-E5F6-G7H8
Plano: Anual  |  Expira em: 31/12/2025  |  ✅ Ativa
Máquina: DESKTOP-JOAO (ativada em 01/01/2025)
Transferências usadas: 1/2 este ano
[Renovar]  [Transferir]  [Ver Histórico]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

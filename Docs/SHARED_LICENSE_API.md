# AtendIA — API de Licenciamento Compartilhada

---

## Visão Geral

A API de licenciamento é um serviço independente compartilhado entre os dois produtos (SaaS Web e Desktop). Gerencia todo o ciclo de vida das licenças: geração após compra, validação, renovação, revogação e transferência. Integra-se com gateways de pagamento para automação completa do fluxo de venda.

**Base URL:** `https://license.atend-ia.com/v1/`

---

## Endpoints da API de Licenciamento

### 1. Ativar Serial
```
POST /licenses/activate
```
Ativa um serial em uma máquina específica (versão desktop).

**Request:**
```json
{
  "serial": "ATND-A1B2-C3D4-E5F6-G7H8",
  "hwid": "sha256-hash-do-hardware",
  "machine_name": "DESKTOP-JOAO",
  "app_version": "1.5.0",
  "os": "Windows 11 x64"
}
```

**Response (sucesso):**
```json
{
  "success": true,
  "license": {
    "serial": "ATND-A1B2-C3D4-E5F6-G7H8",
    "plan": "annual",
    "expires_at": "2026-01-15T23:59:59Z",
    "features": ["ai_agent", "whatsapp", "reports", "export"],
    "transfers_remaining": 2
  },
  "offline_token": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
}
```

**Response (erro — já ativada):**
```json
{
  "success": false,
  "error": "LICENSE_ALREADY_ACTIVATED",
  "message": "Este serial já está ativado em outra máquina. Use a opção de transferência no portal do cliente.",
  "transfer_url": "https://app.atend-ia.com/minha-conta/licencas/transferir"
}
```

---

### 2. Validar Serial
```
POST /licenses/validate
```
Valida se um serial está ativo e não expirado. Chamado periodicamente pelo app desktop.

**Request:**
```json
{
  "serial": "ATND-A1B2-C3D4-E5F6-G7H8",
  "hwid": "sha256-hash-do-hardware"
}
```

**Response:**
```json
{
  "valid": true,
  "plan": "annual",
  "expires_at": "2026-01-15T23:59:59Z",
  "days_until_expiry": 365,
  "features": ["ai_agent", "whatsapp", "reports"],
  "offline_token": "eyJ..."
}
```

---

### 3. Revogar Serial
```
POST /licenses/revoke
Authorization: Bearer {admin_token}
```
Apenas para uso administrativo interno. Revoga um serial ativo.

**Request:**
```json
{
  "serial": "ATND-A1B2-C3D4-E5F6-G7H8",
  "reason": "chargeback | fraud | request | test"
}
```

---

### 4. Listar Licenças do Cliente
```
GET /licenses
Authorization: Bearer {customer_token}
```
Retorna todas as licenças vinculadas ao e-mail do cliente logado.

**Response:**
```json
{
  "licenses": [
    {
      "serial": "ATND-A1B2-C3D4-E5F6-G7H8",
      "plan": "annual",
      "status": "active",
      "activated_at": "2025-01-15T10:00:00Z",
      "expires_at": "2026-01-15T23:59:59Z",
      "machine_name": "DESKTOP-JOAO",
      "transfers_used": 1,
      "transfers_remaining": 1
    }
  ]
}
```

---

### 5. Renovar Licença
```
POST /licenses/renew
Authorization: Bearer {customer_token}
```
Renova uma licença existente. Pode mudar de plano.

**Request:**
```json
{
  "serial": "ATND-A1B2-C3D4-E5F6-G7H8",
  "plan": "annual",
  "payment_method_id": "pm_stripe_xxx"
}
```

**Response:**
```json
{
  "success": true,
  "new_expires_at": "2027-01-15T23:59:59Z",
  "invoice_url": "https://...",
  "new_offline_token": "eyJ..."
}
```

---

### 6. Transferir Licença
```
POST /licenses/transfer
Authorization: Bearer {customer_token}
```
Gera token de transferência para ativar em nova máquina.

**Request:**
```json
{
  "serial": "ATND-A1B2-C3D4-E5F6-G7H8"
}
```

**Response:**
```json
{
  "transfer_token": "TRF-XXXX-XXXX-XXXX",
  "expires_at": "2025-01-16T10:00:00Z",
  "transfers_remaining_after": 0,
  "warning": "Você usará sua última transferência disponível este ano."
}
```

---

## Estrutura do Banco de Dados de Licenças

```sql
-- Clientes
CREATE TABLE license_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  document VARCHAR(20),           -- CPF ou CNPJ
  phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Licenças
CREATE TABLE licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial VARCHAR(24) UNIQUE NOT NULL,  -- ATNDXXXXXXXXXXXXXXXXXX (sem hifens internamente)
  customer_id UUID NOT NULL REFERENCES license_customers(id),
  product VARCHAR(20) DEFAULT 'desktop' CHECK (product IN ('desktop','saas')),
  plan VARCHAR(20) CHECK (plan IN ('monthly','quarterly','semiannual','annual')),
  status VARCHAR(20) DEFAULT 'inactive'
    CHECK (status IN ('inactive','active','expired','revoked','suspended')),
  hwid VARCHAR(64),                    -- hardware ID da máquina ativada
  machine_name VARCHAR(255),
  app_version VARCHAR(20),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason VARCHAR(100),
  transfers_used INTEGER DEFAULT 0,
  transfers_reset_at TIMESTAMPTZ,      -- quando o contador de transferências reseta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Histórico de transferências
CREATE TABLE license_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES licenses(id),
  from_hwid VARCHAR(64),
  to_hwid VARCHAR(64),
  from_machine VARCHAR(255),
  to_machine VARCHAR(255),
  transfer_token VARCHAR(20),
  token_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pagamentos
CREATE TABLE license_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES licenses(id),
  customer_id UUID NOT NULL REFERENCES license_customers(id),
  gateway VARCHAR(20) CHECK (gateway IN ('stripe','mercadopago')),
  gateway_payment_id VARCHAR(255) UNIQUE,
  gateway_order_id VARCHAR(255),
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'BRL',
  plan VARCHAR(20),
  status VARCHAR(20) CHECK (status IN ('pending','paid','failed','refunded','chargeback')),
  paid_at TIMESTAMPTZ,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log de validações (para auditoria e detecção de abuso)
CREATE TABLE license_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES licenses(id),
  hwid VARCHAR(64),
  ip_address VARCHAR(45),
  app_version VARCHAR(20),
  result VARCHAR(20),              -- valid, invalid, expired, banned
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_licenses_serial ON licenses(serial);
CREATE INDEX idx_licenses_customer ON licenses(customer_id);
CREATE INDEX idx_licenses_hwid ON licenses(hwid);
CREATE INDEX idx_payments_gateway ON license_payments(gateway, gateway_payment_id);
```

---

## Integração com Gateways de Pagamento

### Stripe (Recomendado para pagamentos internacionais)

**Fluxo:**
```
1. Cliente preenche checkout no site
2. Frontend cria PaymentIntent via Stripe Elements
3. Stripe processa pagamento
4. Stripe envia webhook: payment_intent.succeeded
5. Nosso backend:
   a. Valida assinatura do webhook
   b. Gera serial único
   c. Cria registro no banco (status: active)
   d. Envia e-mail com serial ao cliente
```

**Configuração de Webhook Stripe:**
```typescript
// POST /webhooks/stripe
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await handleSuccessfulPayment({
      gatewayPaymentId: paymentIntent.id,
      amount: paymentIntent.amount,
      customerEmail: paymentIntent.receipt_email!,
      plan: paymentIntent.metadata.plan,
    });
  }

  res.json({ received: true });
});
```

### Mercado Pago (Recomendado para Brasil — PIX, boleto, cartão)

**Fluxo:**
```
1. Backend cria preferência de pagamento (MP API)
2. Frontend redireciona para checkout do Mercado Pago
3. Cliente paga (cartão, PIX ou boleto)
4. Mercado Pago envia IPN (Instant Payment Notification)
5. Nosso backend valida e processa igual ao Stripe
```

---

## Página de Vendas e Checkout

**URL:** `atend-ia.com/desktop`

### Campos do Checkout
```
Nome completo: ________________________________
E-mail:        ________________________________
CPF/CNPJ:      ________________________________

Escolha seu plano:
  (●) Mensal    R$ 147/mês
  ( ) Trimestral R$ 381 (R$ 127/mês) — Economize 14%
  ( ) Semestral  R$ 642 (R$ 107/mês) — Economize 27%  ⭐ MAIS POPULAR
  ( ) Anual      R$ 1.044 (R$ 87/mês) — Economize 41%

Forma de pagamento:
  [  Cartão de Crédito  ] [  PIX  ] [  Boleto  ]

[  Comprar Agora — R$ X  ]

✓ Ativação imediata por e-mail
✓ Garantia de 7 dias
✓ Suporte por e-mail incluído
```

---

## E-mail Automático Após Compra

**Assunto:** `Seu AtendIA Desktop está pronto! Serial: ATND-XXXX-XXXX-XXXX-XXXX`

```
Olá, {Nome}!

Sua compra foi confirmada. Aqui estão suas informações de acesso:

┌─────────────────────────────────────────────┐
│  Serial de Ativação:                        │
│  ATND-A1B2-C3D4-E5F6-G7H8                  │
│                                             │
│  Plano: Anual  |  Válido até: 15/01/2026   │
└─────────────────────────────────────────────┘

Próximos passos:
1. Baixe o instalador: [botão Download AtendIA Desktop]
2. Execute o instalador e siga o wizard
3. Na tela de ativação, insira o serial acima
4. Pronto! Seu AtendIA está ativo.

Guarde este e-mail — você precisará do serial se reinstalar o sistema.

Dúvidas? Acesse nossa documentação ou envie e-mail para suporte@atend-ia.com

Abraços,
Equipe AtendIA
```

---

## Painel do Cliente

**URL:** `app.atend-ia.com/minha-conta`

### Funcionalidades
- Ver todas as licenças ativas e históricas
- Baixar o instalador mais recente
- Iniciar processo de transferência de licença
- Ver histórico de pagamentos e baixar recibos
- Atualizar dados cadastrais
- Solicitar reembolso (dentro do prazo de garantia)
- Abrir chamado de suporte

---

## Painel Administrativo (Interno AtendIA)

**URL:** `admin.atend-ia.com`
**Acesso:** apenas equipe interna

### Funcionalidades
- Dashboard: total de licenças ativas, receita mensal, churn
- Buscar cliente por e-mail, nome, CPF/CNPJ ou serial
- Ver detalhes de qualquer licença
- Revogar licença (com motivo)
- Adicionar tempo grátis a uma licença
- Ver log de validações (detectar compartilhamento)
- Exportar relatório de licenças
- Reenviar e-mail de ativação
- Gerar licenças manuais (para parcerias, influenciadores, etc.)

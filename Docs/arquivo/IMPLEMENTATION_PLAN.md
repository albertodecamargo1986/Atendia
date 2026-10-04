# AtendIA — Plano de Implementação (SaaS Multi-tenant)

## Arquitetura do Sistema

O AtendIA é um **SaaS multi-tenant** composto por:

| Camada | Tecnologia | Descrição |
|--------|-----------|-----------|
| **Backend** | Node.js + Express + Prisma | API REST + Socket.io + Workers BullMQ |
| **Frontend** | React + Vite + Tailwind | Painel web do cliente/admin |
| **Landing** | Next.js 14 | Página de marketing + checkout |
| **Banco** | PostgreSQL + Redis | Dados + filas + cache |
| **Pagamentos** | Mercado Pago + Stripe | Checkout/assinaturas via gateway |

---

## Planos (FREE / STARTER / PRO / ENTERPRISE)

Os planos são configurados via `packages/backend/src/config/plans.ts`:
- **FREE**: Grátis, 1 agente, 100 conversas/mês, 500 requisições IA
- **STARTER**: R$ 147/mês, 3 agentes, 1000 conversas, 5 usuários
- **PRO**: R$ 381/mês, 10 agentes, 10000 conversas, 20 usuários
- **ENTERPRISE**: R$ 1.044/mês, ilimitado

---

## Fluxo de Pagamento (SaaS)

```
Landing (Next.js) → API Backend → Gateway (MP/Stripe)
                                       ↓
                              Webhook → Aprova pagamento
                                       ↓
                              Subscription + Tenant ativado
                                       ↓
                              Email de boas-vindas
```

---

## Módulos Implementados

- Auth (JWT + refresh token + 2FA)
- Agentes de IA (OpenAI/Anthropic)
- WhatsApp (conexão via Baileys)
- Conversas (chat em tempo real via Socket.io)
- Tickets + Filas + Contatos
- Knowledge Base
- Voice Profiles (ElevenLabs)
- Campanhas
- Webhooks outbound
- Relatórios
- Chat interno entre atendentes
- Painel Admin (clientes, pagamentos, webhooks, planos)
- Assinaturas (Subscription + Mercado Pago/Stripe)
- Permissionamento por role (OWNER/ADMIN/SUPERVISOR/OPERATOR)

---

## Próximos Passos

1. Integrar WhatsApp real via Baileys (hoje simulado)
2. Configurar tokens Mercado Pago no .env
3. BullMQ para processamento em background
4. Testar fluxo completo: compra → pagamento → assinatura ativa
5. Deploy em produção
-- Seed PlanConfig com valores iniciais
-- Para planos pagos, os preços de referência no MP serão criados via wizard /admin/mercadopago

INSERT INTO "PlanConfig" (id, "planId", name, price, description, features, limits, "isActive", "updatedAt") VALUES
(
  gen_random_uuid(),
  'FREE',
  'Free',
  0,
  'Para testar o sistema',
  '["1 agente", "1 WhatsApp", "100 conversas/mês", "500 requisições de IA"]',
  '{"maxAgents": 1, "maxWhatsapp": 1, "maxConversations": 100, "maxAiRequests": 500, "maxTeamMembers": 1}',
  true,
  NOW()
),
(
  gen_random_uuid(),
  'STARTER',
  'Starter',
  147,
  'Ideal para pequenos negócios',
  '["3 agentes", "2 WhatsApp", "1.000 conversas/mês", "5.000 requisições de IA", "Filas", "Respostas rápidas", "Horário comercial"]',
  '{"maxAgents": 3, "maxWhatsapp": 2, "maxConversations": 1000, "maxAiRequests": 5000, "maxTeamMembers": 5}',
  true,
  NOW()
),
(
  gen_random_uuid(),
  'PRO',
  'Pro',
  381,
  'Para equipes em crescimento',
  '["10 agentes", "5 WhatsApp", "10.000 conversas/mês", "50.000 requisições de IA", "Campanhas", "Perfis de voz", "Webhooks", "Chat interno"]',
  '{"maxAgents": 10, "maxWhatsapp": 5, "maxConversations": 10000, "maxAiRequests": 50000, "maxTeamMembers": 20}',
  true,
  NOW()
),
(
  gen_random_uuid(),
  'ENTERPRISE',
  'Enterprise',
  1044,
  'Solução completa e ilimitada',
  '["Agentes ilimitados", "WhatsApp ilimitado", "Conversas ilimitadas", "IA ilimitada", "Todos os módulos", "Suporte prioritário"]',
  '{"maxAgents": -1, "maxWhatsapp": -1, "maxConversations": -1, "maxAiRequests": -1, "maxTeamMembers": -1}',
  true,
  NOW()
)
ON CONFLICT ("planId") DO NOTHING;
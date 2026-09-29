import rateLimit from 'express-rate-limit';

const rlBase = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false } as any,
};

// Limite geral para rotas públicas
export const publicLimiter = rateLimit({
  ...rlBase,
  max: 100,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Limite de requisições atingido. Tente novamente em alguns minutos.' },
  },
});

// Limite de autenticação — aplicado só a login/cadastro/esqueci/reset
// (/auth/refresh e /auth/me NÃO contam, senão o usuário é bloqueado navegando)
export const authLimiter = rateLimit({
  ...rlBase,
  max: 20,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  },
});

// Webhooks de pagamento
export const webhookLimiter = rateLimit({
  ...rlBase,
  max: 1000,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Limite de webhook excedido.' } },
});

// Criação de pagamento
export const checkoutLimiter = rateLimit({
  ...rlBase,
  max: 30,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Muitas tentativas de pagamento. Tente novamente em alguns minutos.' },
  },
});

import rateLimit from 'express-rate-limit';

const rlBase = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false } as any
};

// General public limiter
export const publicLimiter = rateLimit({
  ...rlBase,
  max: 100,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Limite de requisições atingido. Tente novamente em alguns minutos.'
    }
  }
});

// Auth limiter - stricter
export const authLimiter = rateLimit({
  ...rlBase,
  max: 20,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
    }
  }
});

// Webhook limiter - higher limit for payment provider callbacks
export const webhookLimiter = rateLimit({
  ...rlBase,
  max: 1000,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Limite de webhook excedido.'
    }
  }
});

// Checkout limiter - for payment creation
export const checkoutLimiter = rateLimit({
  ...rlBase,
  max: 30,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Muitas tentativas de checkout. Tente novamente em alguns minutos.'
    }
  }
});
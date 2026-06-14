import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';

/**
 * General rate limiter: 100 requests per 15 minutes per IP.
 */
export const generalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
});

/**
 * Strict rate limiter for sensitive endpoints (activate, transfer).
 * 5 requests per 15 minutes per IP.
 */
export const strictLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many attempts on this endpoint. Please try again later.',
  },
});

/**
 * Moderate rate limiter for heartbeat and validation.
 * 30 requests per 15 minutes per IP.
 */
export const moderateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Rate limit exceeded for this endpoint.',
  },
});

/**
 * Lenient rate limiter for security reports.
 * 10 requests per 5 minutes per IP.
 */
export const securityLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Security report rate limit exceeded.',
  },
});

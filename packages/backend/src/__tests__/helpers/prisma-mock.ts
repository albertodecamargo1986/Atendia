import { vi } from 'vitest';

export function createPrismaMock() {
  return {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contact: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    ticket: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    license: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    licenseEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    webhook: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(typeof fn === 'function' ? {
      ticket: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      payment: {
        update: vi.fn(),
      },
      license: {
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    } : undefined)),
  };
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;

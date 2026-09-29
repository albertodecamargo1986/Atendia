import { vi } from 'vitest';

export function createPrismaMock() {
  const mock: any = {
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
  };
  // $transaction(fn) chama fn(mock) — as operações da transação usam o próprio mock;
  // $transaction([...]) resolve as promises em ordem.
  mock.$transaction = vi.fn((arg: any) => (typeof arg === 'function' ? arg(mock) : Promise.all(arg)));
  return mock as typeof mock & { $transaction: ReturnType<typeof vi.fn> };
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;

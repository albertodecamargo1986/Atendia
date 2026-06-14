import { describe, it, expect, vi, beforeEach } from 'vitest';

// MP env vars are set in vitest.config.ts env block

const { mockPrisma, mockLicenseService } = vi.hoisted(() => ({
  mockPrisma: {
    customer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    license: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((ops) => typeof ops === 'function' ? ops({ payment: { update: vi.fn() }, license: { update: vi.fn(), updateMany: vi.fn() } }) : Promise.all(ops)),
  },
  mockLicenseService: {
    ensureUniqueSerial: vi.fn(() => Promise.resolve('ATND-ABCD-EFGH-IJKL-MNOP')),
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../services/license.service.js', () => mockLicenseService);

// Mock MercadoPago SDK so it doesn't make real API calls
vi.mock('mercadopago', () => ({
  MercadoPagoConfig: vi.fn(),
  Preference: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue({
      id: 'pref-1',
      init_point: 'https://mp.com/pay',
      sandbox_init_point: 'https://sandbox.mp.com/pay',
    }),
  })),
}));

import { createPreference, handleMercadoPagoWebhook } from '../services/mercadopago.service.js';
import { ValidationError } from '../lib/errors.js';

const mockCustomer = { id: 'cust-1', name: 'Joao', email: 'joao@test.com', cpfCnpj: '12345678901', phone: '11999999999' };
const mockLicense = { id: 'lic-1', serial: 'ATND-ABCD-EFGH-IJKL-MNOP', plan: 'STARTER', status: 'INACTIVE', customerId: 'cust-1' };
const mockPayment = {
  id: 'pay-1', customerId: 'cust-1', licenseId: 'lic-1',
  licenseSerial: 'ATND-ABCD-EFGH-IJKL-MNOP', gateway: 'MERCADOPAGO',
  amount: 147, plan: 'mensal', periodMonths: 1, status: 'PENDING',
  mercadopagoPreferenceId: 'pref-1',
};

describe('mercadopago.service — createPreference', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects invalid plan', async () => {
    await expect(createPreference({
      name: 'Joao', email: 'joao@test.com', cpfCnpj: '12345678901',
      phone: '11999999999', plan: 'invalido',
    })).rejects.toThrow(ValidationError);
  });

  it('creates new customer if not found', async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    mockPrisma.customer.create.mockResolvedValue(mockCustomer);
    mockPrisma.license.create.mockResolvedValue(mockLicense);
    mockPrisma.payment.create.mockResolvedValue(mockPayment);
    mockPrisma.payment.update.mockResolvedValue(mockPayment);

    const result = await createPreference({
      name: 'Joao', email: 'joao@test.com', cpfCnpj: '12345678901',
      phone: '11999999999', plan: 'mensal',
    });

    expect(mockPrisma.customer.create).toHaveBeenCalled();
    expect(result.serial).toBe('ATND-ABCD-EFGH-IJKL-MNOP');
  });

  it('updates existing customer', async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(mockCustomer);
    mockPrisma.customer.update.mockResolvedValue(mockCustomer);
    mockPrisma.license.create.mockResolvedValue(mockLicense);
    mockPrisma.payment.create.mockResolvedValue(mockPayment);
    mockPrisma.payment.update.mockResolvedValue(mockPayment);

    const result = await createPreference({
      name: 'Joao Updated', email: 'joao@test.com', cpfCnpj: '12345678901',
      phone: '11888888888', plan: 'mensal',
    });

    expect(mockPrisma.customer.update).toHaveBeenCalled();
    expect(result).toHaveProperty('serial');
  });
});

describe('mercadopago.service — handleMercadoPagoWebhook', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('approves payment and activates license', async () => {
    const paymentWithLicense = { ...mockPayment, status: 'PENDING', license: mockLicense };
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    mockPrisma.payment.findUnique.mockResolvedValue(paymentWithLicense);

    const mockTxPaymentUpdate = vi.fn().mockResolvedValue({ ...mockPayment, status: 'APPROVED', gatewayTransactionId: 'mp-123' });
    const mockTxLicenseUpdate = vi.fn().mockResolvedValue({ ...mockLicense, status: 'ACTIVE' });
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      if (typeof fn === 'function') {
        return fn({ payment: { update: mockTxPaymentUpdate }, license: { update: mockTxLicenseUpdate, updateMany: vi.fn() } });
      }
      return Promise.all(fn);
    });

    const result = await handleMercadoPagoWebhook({
      type: 'payment', action: 'payment.approved',
      data: { id: 'mp-123' }, external_reference: 'pay-1',
    });

    expect(result.processed).toBe(true);
  });

  it('rejects payment', async () => {
    const paymentWithLicense = { ...mockPayment, status: 'PENDING', license: mockLicense };
    mockPrisma.payment.findFirst.mockResolvedValue(paymentWithLicense);

    const result = await handleMercadoPagoWebhook({
      type: 'payment', action: 'payment.rejected',
      data: { id: 'mp-456' },
    });

    expect(result.processed).toBe(true);
  });

  it('refunds payment and suspends licenses', async () => {
    const paymentWithLicense = { ...mockPayment, status: 'APPROVED', license: mockLicense };
    mockPrisma.payment.findFirst.mockResolvedValue(paymentWithLicense);
    const mockTxPaymentUpdate = vi.fn().mockResolvedValue({ ...mockPayment, status: 'REFUNDED' });
    const mockTxLicenseUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      if (typeof fn === 'function') {
        return fn({ payment: { update: mockTxPaymentUpdate }, license: { update: vi.fn(), updateMany: mockTxLicenseUpdateMany } });
      }
      return Promise.all(fn);
    });

    const result = await handleMercadoPagoWebhook({
      type: 'payment', action: 'payment.refunded',
      data: { id: 'mp-789' }, external_reference: 'pay-1',
    });

    expect(result.processed).toBe(true);
  });

  it('returns processed:false for unknown type', async () => {
    const result = await handleMercadoPagoWebhook({ type: 'unknown', data: {} });
    expect(result.processed).toBe(false);
  });

  it('handles merchant_order type', async () => {
    const result = await handleMercadoPagoWebhook({ type: 'merchant_order', data: {} });
    expect(result.processed).toBe(true);
    expect(result.type).toBe('merchant_order');
  });
});

describe('mercadopago.service — findPaymentByMpId strategies', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('strategy 1: finds by gatewayTransactionId', async () => {
    const paymentFound = { ...mockPayment, gatewayTransactionId: 'mp-100', license: mockLicense };
    mockPrisma.payment.findFirst.mockResolvedValue(paymentFound);

    await handleMercadoPagoWebhook({
      type: 'payment', action: 'payment.approved', data: { id: 'mp-100' },
    });

    expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gateway: 'MERCADOPAGO', gatewayTransactionId: 'mp-100' },
      }),
    );
  });

  it('strategy 2: falls back to external_reference', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    mockPrisma.payment.findUnique.mockResolvedValue({ ...mockPayment, gateway: 'MERCADOPAGO', license: mockLicense });
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      if (typeof fn === 'function') return fn({ payment: { update: vi.fn() }, license: { update: vi.fn(), updateMany: vi.fn() } });
      return Promise.all(fn);
    });

    await handleMercadoPagoWebhook({
      type: 'payment', action: 'payment.approved',
      data: { id: 'mp-200' }, external_reference: 'pay-1',
    });

    expect(mockPrisma.payment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pay-1' } }),
    );
  });

  it('warns when payment not found', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockPrisma.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.payment.findUnique.mockResolvedValue(null);

    await handleMercadoPagoWebhook({
      type: 'payment', action: 'payment.approved', data: { id: 'mp-999' },
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('payment not found'));
    warnSpy.mockRestore();
  });
});

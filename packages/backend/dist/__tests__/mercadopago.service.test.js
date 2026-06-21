"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// MP env vars are set in vitest.config.ts env block
const { mockPrisma, mockLicenseService } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        customer: { findFirst: vitest_1.vi.fn(), create: vitest_1.vi.fn(), update: vitest_1.vi.fn(), findUnique: vitest_1.vi.fn() },
        license: { findUnique: vitest_1.vi.fn(), create: vitest_1.vi.fn(), update: vitest_1.vi.fn(), updateMany: vitest_1.vi.fn() },
        payment: { findUnique: vitest_1.vi.fn(), findFirst: vitest_1.vi.fn(), create: vitest_1.vi.fn(), update: vitest_1.vi.fn() },
        $transaction: vitest_1.vi.fn((ops) => typeof ops === 'function' ? ops({ payment: { update: vitest_1.vi.fn() }, license: { update: vitest_1.vi.fn(), updateMany: vitest_1.vi.fn() } }) : Promise.all(ops)),
    },
    mockLicenseService: {
        ensureUniqueSerial: vitest_1.vi.fn(() => Promise.resolve('ATND-ABCD-EFGH-IJKL-MNOP')),
    },
}));
vitest_1.vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vitest_1.vi.mock('../services/license.service.js', () => mockLicenseService);
// Mock MercadoPago SDK so it doesn't make real API calls
vitest_1.vi.mock('mercadopago', () => ({
    MercadoPagoConfig: vitest_1.vi.fn(),
    Preference: vitest_1.vi.fn().mockImplementation(() => ({
        create: vitest_1.vi.fn().mockResolvedValue({
            id: 'pref-1',
            init_point: 'https://mp.com/pay',
            sandbox_init_point: 'https://sandbox.mp.com/pay',
        }),
    })),
}));
const mercadopago_service_js_1 = require("../services/mercadopago.service.js");
const errors_js_1 = require("../lib/errors.js");
const mockCustomer = { id: 'cust-1', name: 'Joao', email: 'joao@test.com', cpfCnpj: '12345678901', phone: '11999999999' };
const mockLicense = { id: 'lic-1', serial: 'ATND-ABCD-EFGH-IJKL-MNOP', plan: 'STARTER', status: 'INACTIVE', customerId: 'cust-1' };
const mockPayment = {
    id: 'pay-1', customerId: 'cust-1', licenseId: 'lic-1',
    licenseSerial: 'ATND-ABCD-EFGH-IJKL-MNOP', gateway: 'MERCADOPAGO',
    amount: 147, plan: 'mensal', periodMonths: 1, status: 'PENDING',
    mercadopagoPreferenceId: 'pref-1',
};
(0, vitest_1.describe)('mercadopago.service — createPreference', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('rejects invalid plan', async () => {
        await (0, vitest_1.expect)((0, mercadopago_service_js_1.createPreference)({
            name: 'Joao', email: 'joao@test.com', cpfCnpj: '12345678901',
            phone: '11999999999', plan: 'invalido',
        })).rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('creates new customer if not found', async () => {
        mockPrisma.customer.findFirst.mockResolvedValue(null);
        mockPrisma.customer.create.mockResolvedValue(mockCustomer);
        mockPrisma.license.create.mockResolvedValue(mockLicense);
        mockPrisma.payment.create.mockResolvedValue(mockPayment);
        mockPrisma.payment.update.mockResolvedValue(mockPayment);
        const result = await (0, mercadopago_service_js_1.createPreference)({
            name: 'Joao', email: 'joao@test.com', cpfCnpj: '12345678901',
            phone: '11999999999', plan: 'mensal',
        });
        (0, vitest_1.expect)(mockPrisma.customer.create).toHaveBeenCalled();
        (0, vitest_1.expect)(result.serial).toBe('ATND-ABCD-EFGH-IJKL-MNOP');
    });
    (0, vitest_1.it)('updates existing customer', async () => {
        mockPrisma.customer.findFirst.mockResolvedValue(mockCustomer);
        mockPrisma.customer.update.mockResolvedValue(mockCustomer);
        mockPrisma.license.create.mockResolvedValue(mockLicense);
        mockPrisma.payment.create.mockResolvedValue(mockPayment);
        mockPrisma.payment.update.mockResolvedValue(mockPayment);
        const result = await (0, mercadopago_service_js_1.createPreference)({
            name: 'Joao Updated', email: 'joao@test.com', cpfCnpj: '12345678901',
            phone: '11888888888', plan: 'mensal',
        });
        (0, vitest_1.expect)(mockPrisma.customer.update).toHaveBeenCalled();
        (0, vitest_1.expect)(result).toHaveProperty('serial');
    });
});
(0, vitest_1.describe)('mercadopago.service — handleMercadoPagoWebhook', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('approves payment and activates license', async () => {
        const paymentWithLicense = { ...mockPayment, status: 'PENDING', license: mockLicense };
        mockPrisma.payment.findFirst.mockResolvedValue(null);
        mockPrisma.payment.findUnique.mockResolvedValue(paymentWithLicense);
        const mockTxPaymentUpdate = vitest_1.vi.fn().mockResolvedValue({ ...mockPayment, status: 'APPROVED', gatewayTransactionId: 'mp-123' });
        const mockTxLicenseUpdate = vitest_1.vi.fn().mockResolvedValue({ ...mockLicense, status: 'ACTIVE' });
        mockPrisma.$transaction.mockImplementation(async (fn) => {
            if (typeof fn === 'function') {
                return fn({ payment: { update: mockTxPaymentUpdate }, license: { update: mockTxLicenseUpdate, updateMany: vitest_1.vi.fn() } });
            }
            return Promise.all(fn);
        });
        const result = await (0, mercadopago_service_js_1.handleMercadoPagoWebhook)({
            type: 'payment', action: 'payment.approved',
            data: { id: 'mp-123' }, external_reference: 'pay-1',
        });
        (0, vitest_1.expect)(result.processed).toBe(true);
    });
    (0, vitest_1.it)('rejects payment', async () => {
        const paymentWithLicense = { ...mockPayment, status: 'PENDING', license: mockLicense };
        mockPrisma.payment.findFirst.mockResolvedValue(paymentWithLicense);
        const result = await (0, mercadopago_service_js_1.handleMercadoPagoWebhook)({
            type: 'payment', action: 'payment.rejected',
            data: { id: 'mp-456' },
        });
        (0, vitest_1.expect)(result.processed).toBe(true);
    });
    (0, vitest_1.it)('refunds payment and suspends licenses', async () => {
        const paymentWithLicense = { ...mockPayment, status: 'APPROVED', license: mockLicense };
        mockPrisma.payment.findFirst.mockResolvedValue(paymentWithLicense);
        const mockTxPaymentUpdate = vitest_1.vi.fn().mockResolvedValue({ ...mockPayment, status: 'REFUNDED' });
        const mockTxLicenseUpdateMany = vitest_1.vi.fn().mockResolvedValue({ count: 1 });
        mockPrisma.$transaction.mockImplementation(async (fn) => {
            if (typeof fn === 'function') {
                return fn({ payment: { update: mockTxPaymentUpdate }, license: { update: vitest_1.vi.fn(), updateMany: mockTxLicenseUpdateMany } });
            }
            return Promise.all(fn);
        });
        const result = await (0, mercadopago_service_js_1.handleMercadoPagoWebhook)({
            type: 'payment', action: 'payment.refunded',
            data: { id: 'mp-789' }, external_reference: 'pay-1',
        });
        (0, vitest_1.expect)(result.processed).toBe(true);
    });
    (0, vitest_1.it)('returns processed:false for unknown type', async () => {
        const result = await (0, mercadopago_service_js_1.handleMercadoPagoWebhook)({ type: 'unknown', data: {} });
        (0, vitest_1.expect)(result.processed).toBe(false);
    });
    (0, vitest_1.it)('handles merchant_order type', async () => {
        const result = await (0, mercadopago_service_js_1.handleMercadoPagoWebhook)({ type: 'merchant_order', data: {} });
        (0, vitest_1.expect)(result.processed).toBe(true);
        (0, vitest_1.expect)(result.type).toBe('merchant_order');
    });
});
(0, vitest_1.describe)('mercadopago.service — findPaymentByMpId strategies', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('strategy 1: finds by gatewayTransactionId', async () => {
        const paymentFound = { ...mockPayment, gatewayTransactionId: 'mp-100', license: mockLicense };
        mockPrisma.payment.findFirst.mockResolvedValue(paymentFound);
        await (0, mercadopago_service_js_1.handleMercadoPagoWebhook)({
            type: 'payment', action: 'payment.approved', data: { id: 'mp-100' },
        });
        (0, vitest_1.expect)(mockPrisma.payment.findFirst).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: { gateway: 'MERCADOPAGO', gatewayTransactionId: 'mp-100' },
        }));
    });
    (0, vitest_1.it)('strategy 2: falls back to external_reference', async () => {
        mockPrisma.payment.findFirst.mockResolvedValue(null);
        mockPrisma.payment.findUnique.mockResolvedValue({ ...mockPayment, gateway: 'MERCADOPAGO', license: mockLicense });
        mockPrisma.$transaction.mockImplementation(async (fn) => {
            if (typeof fn === 'function')
                return fn({ payment: { update: vitest_1.vi.fn() }, license: { update: vitest_1.vi.fn(), updateMany: vitest_1.vi.fn() } });
            return Promise.all(fn);
        });
        await (0, mercadopago_service_js_1.handleMercadoPagoWebhook)({
            type: 'payment', action: 'payment.approved',
            data: { id: 'mp-200' }, external_reference: 'pay-1',
        });
        (0, vitest_1.expect)(mockPrisma.payment.findUnique).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ where: { id: 'pay-1' } }));
    });
    (0, vitest_1.it)('warns when payment not found', async () => {
        const warnSpy = vitest_1.vi.spyOn(console, 'warn').mockImplementation(() => { });
        mockPrisma.payment.findFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
        mockPrisma.payment.findUnique.mockResolvedValue(null);
        await (0, mercadopago_service_js_1.handleMercadoPagoWebhook)({
            type: 'payment', action: 'payment.approved', data: { id: 'mp-999' },
        });
        (0, vitest_1.expect)(warnSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('payment not found'));
        warnSpy.mockRestore();
    });
});
//# sourceMappingURL=mercadopago.service.test.js.map
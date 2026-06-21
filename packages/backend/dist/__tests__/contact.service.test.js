"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockPrisma } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        contact: {
            findUnique: vitest_1.vi.fn(), findFirst: vitest_1.vi.fn(), findMany: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(), update: vitest_1.vi.fn(), delete: vitest_1.vi.fn(), upsert: vitest_1.vi.fn(),
        },
        conversation: { findFirst: vitest_1.vi.fn() },
    },
}));
vitest_1.vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
const contact_service_js_1 = require("../services/contact.service.js");
const errors_js_1 = require("../lib/errors.js");
const tenantId = 'tenant-1';
const phone = '5511999999999';
const mockContact = {
    id: 'contact-1', tenantId, phone, name: 'Joao Silva',
    email: '', profilePicUrl: null, isGroup: false, lid: null,
};
(0, vitest_1.describe)('contact.service — findOrCreateContact', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('updates existing contact via upsert', async () => {
        mockPrisma.contact.upsert.mockResolvedValue({
            ...mockContact, name: 'Joao Updated', profilePicUrl: 'https://pic.url/joao',
        });
        const result = await (0, contact_service_js_1.findOrCreateContact)(tenantId, phone, 'Joao Updated', 'https://pic.url/joao', false, 'lid-123');
        (0, vitest_1.expect)(mockPrisma.contact.upsert).toHaveBeenCalledWith({
            where: { tenantId_phone: { tenantId, phone } },
            update: vitest_1.expect.objectContaining({
                name: 'Joao Updated', profilePicUrl: 'https://pic.url/joao', lid: 'lid-123',
            }),
            create: vitest_1.expect.objectContaining({ tenantId, phone, name: 'Joao Updated' }),
        });
    });
    (0, vitest_1.it)('creates new contact when phone does not exist', async () => {
        mockPrisma.contact.upsert.mockResolvedValue(mockContact);
        await (0, contact_service_js_1.findOrCreateContact)(tenantId, '5511988887777', 'Maria', undefined, false);
        (0, vitest_1.expect)(mockPrisma.contact.upsert).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: { tenantId_phone: { tenantId, phone: '5511988887777' } },
            create: vitest_1.expect.objectContaining({ name: 'Maria' }),
        }));
    });
    (0, vitest_1.it)('does not update name when it equals phone (fallback)', async () => {
        mockPrisma.contact.upsert.mockResolvedValue(mockContact);
        await (0, contact_service_js_1.findOrCreateContact)(tenantId, phone, phone, undefined, false);
        (0, vitest_1.expect)(mockPrisma.contact.upsert).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            update: vitest_1.expect.objectContaining({ name: undefined }),
        }));
    });
});
(0, vitest_1.describe)('contact.service — quickSaveFromConversation', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    const mockConversation = {
        id: 'conv-1', tenantId, contactPhone: phone,
        contactName: 'Joao', contactEmail: 'joao@test.com',
    };
    (0, vitest_1.it)('updates existing contact with whitelisted fields only', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
        mockPrisma.contact.findUnique.mockResolvedValue(mockContact);
        mockPrisma.contact.update.mockResolvedValue({ ...mockContact, cpfCnpj: '12345678901', city: 'Sao Paulo' });
        await (0, contact_service_js_1.quickSaveFromConversation)(tenantId, 'conv-1', {
            cpfCnpj: '12345678901', city: 'Sao Paulo',
        });
        (0, vitest_1.expect)(mockPrisma.contact.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: { cpfCnpj: '12345678901', city: 'Sao Paulo' },
        }));
    });
    (0, vitest_1.it)('ignores non-whitelisted fields', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
        mockPrisma.contact.findUnique.mockResolvedValue(mockContact);
        mockPrisma.contact.update.mockResolvedValue(mockContact);
        await (0, contact_service_js_1.quickSaveFromConversation)(tenantId, 'conv-1', {
            cpfCnpj: '12345678901', role: 'admin', maliciousField: 'hacked',
        });
        const updateData = mockPrisma.contact.update.mock.calls[0][0].data;
        (0, vitest_1.expect)(updateData).toHaveProperty('cpfCnpj');
        (0, vitest_1.expect)(updateData).toHaveProperty('role');
        (0, vitest_1.expect)(updateData).not.toHaveProperty('maliciousField');
    });
    (0, vitest_1.it)('creates contact if conversation has no existing contact', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
        mockPrisma.contact.findUnique.mockResolvedValue(null);
        mockPrisma.contact.create.mockResolvedValue(mockContact);
        await (0, contact_service_js_1.quickSaveFromConversation)(tenantId, 'conv-1');
        (0, vitest_1.expect)(mockPrisma.contact.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({ tenantId, phone, name: 'Joao' }),
        }));
    });
    (0, vitest_1.it)('throws NotFoundError for non-existent conversation', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue(null);
        await (0, vitest_1.expect)((0, contact_service_js_1.quickSaveFromConversation)(tenantId, 'nope')).rejects.toThrow(errors_js_1.NotFoundError);
    });
    (0, vitest_1.it)('throws ValidationError for conversation without phone', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, contactPhone: null });
        await (0, vitest_1.expect)((0, contact_service_js_1.quickSaveFromConversation)(tenantId, 'conv-1')).rejects.toThrow(errors_js_1.ValidationError);
    });
});
(0, vitest_1.describe)('contact.service — createContact (schema validation)', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('rejects phone with less than 10 digits', async () => {
        await (0, vitest_1.expect)((0, contact_service_js_1.createContact)(tenantId, { phone: '11999', name: 'Bad Phone', email: '', isGroup: false })).rejects.toThrow();
    });
    (0, vitest_1.it)('rejects empty name', async () => {
        await (0, vitest_1.expect)((0, contact_service_js_1.createContact)(tenantId, { phone: '5511999999999', name: '', email: '', isGroup: false })).rejects.toThrow();
    });
    (0, vitest_1.it)('rejects invalid email format', async () => {
        await (0, vitest_1.expect)((0, contact_service_js_1.createContact)(tenantId, { phone: '5511999999999', name: 'Bad', email: 'not-an-email', isGroup: false })).rejects.toThrow();
    });
    (0, vitest_1.it)('creates contact with valid data', async () => {
        mockPrisma.contact.create.mockResolvedValue(mockContact);
        await (0, contact_service_js_1.createContact)(tenantId, { phone: '5511999999999', name: 'Joao Silva', email: 'joao@test.com', isGroup: false });
        (0, vitest_1.expect)(mockPrisma.contact.create).toHaveBeenCalled();
    });
});
//# sourceMappingURL=contact.service.test.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Create transaction mock that the $transaction callback will receive
const mockTx = {
    ticket: {
        findFirst: vitest_1.vi.fn(),
        findUnique: vitest_1.vi.fn(),
        update: vitest_1.vi.fn(),
        create: vitest_1.vi.fn(),
    },
};
const { mockPrisma } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        ticket: {
            findFirst: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
            count: vitest_1.vi.fn(),
        },
        $transaction: vitest_1.vi.fn((fn, opts) => {
            if (typeof fn === 'function')
                return fn(mockTx);
            return Promise.all(fn);
        }),
    },
}));
vitest_1.vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vitest_1.vi.mock('../lib/socket.js', () => ({
    getIO: vitest_1.vi.fn(() => ({ to: vitest_1.vi.fn(() => ({ emit: vitest_1.vi.fn() })) })),
}));
vitest_1.vi.mock('../services/ticket.dispatcher.js', () => ({
    dispatchTicket: vitest_1.vi.fn(),
}));
const ticket_service_js_1 = require("../services/ticket.service.js");
const errors_js_1 = require("../lib/errors.js");
const tenantId = 'tenant-1';
const contactId = 'contact-1';
const conversationId = 'conv-1';
const mockTicket = {
    id: 'ticket-1', tenantId, contactId, conversationId,
    status: 'PENDING', unreadMessages: 1, lastMessage: 'Oi',
    assignedTo: null, closedAt: null, isGroup: false,
    contact: { id: contactId, name: 'Joao', phone: '11999999999', profilePicUrl: null },
    queue: null, assignee: null,
    conversation: { id: conversationId, channel: 'WHATSAPP', agent: null },
};
(0, vitest_1.describe)('ticket.service — findOrCreateTicket', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        // Reset transaction mock
        mockPrisma.$transaction.mockImplementation((fn, opts) => {
            if (typeof fn === 'function')
                return fn(mockTx);
            return Promise.all(fn);
        });
    });
    (0, vitest_1.it)('returns existing open ticket and increments unread', async () => {
        const existing = { ...mockTicket, status: 'OPEN', id: 'ticket-open' };
        mockTx.ticket.findFirst.mockResolvedValue(existing);
        mockTx.ticket.update.mockResolvedValue({ ...existing, unreadMessages: 3 });
        mockTx.ticket.findUnique.mockResolvedValue({ ...existing, unreadMessages: 3 });
        await (0, ticket_service_js_1.findOrCreateTicket)(tenantId, contactId, conversationId, null, 2, 'Oi', false);
        (0, vitest_1.expect)(mockTx.ticket.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: { id: 'ticket-open' },
            data: vitest_1.expect.objectContaining({ unreadMessages: { increment: 2 } }),
        }));
    });
    (0, vitest_1.it)('reopens recently closed ticket (<2h)', async () => {
        const closedTicket = { ...mockTicket, status: 'CLOSED', id: 'ticket-closed', updatedAt: new Date(), closedAt: new Date() };
        mockTx.ticket.findFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(closedTicket);
        const reopened = { ...closedTicket, status: 'PENDING', assignedTo: null, closedAt: null };
        mockTx.ticket.update.mockResolvedValue(reopened);
        mockTx.ticket.findUnique.mockResolvedValue(reopened);
        await (0, ticket_service_js_1.findOrCreateTicket)(tenantId, contactId, conversationId, null, 1, 'Oi de novo', false);
        (0, vitest_1.expect)(mockTx.ticket.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: { id: 'ticket-closed' },
            data: vitest_1.expect.objectContaining({ status: 'PENDING', assignedTo: null, closedAt: null }),
        }));
    });
    (0, vitest_1.it)('creates new ticket when none exists', async () => {
        const newTicket = { ...mockTicket, id: 'ticket-new' };
        mockTx.ticket.findFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
        mockTx.ticket.create.mockResolvedValue(newTicket);
        await (0, ticket_service_js_1.findOrCreateTicket)(tenantId, contactId, conversationId, 'session-1', 1, 'Nova msg', false);
        (0, vitest_1.expect)(mockTx.ticket.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({ tenantId, contactId, conversationId, status: 'PENDING' }),
        }));
    });
    (0, vitest_1.it)('passes serializable isolation level to $transaction', async () => {
        mockTx.ticket.findFirst.mockResolvedValue(null);
        mockTx.ticket.create.mockResolvedValue(mockTicket);
        await (0, ticket_service_js_1.findOrCreateTicket)(tenantId, contactId, conversationId, null, 1, 'Test', false);
        (0, vitest_1.expect)(mockPrisma.$transaction).toHaveBeenCalledWith(vitest_1.expect.any(Function), { isolationLevel: 'Serializable' });
    });
});
(0, vitest_1.describe)('ticket.service — updateTicket (state machine)', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('valid transition: PENDING → OPEN with assignedTo', async () => {
        mockPrisma.ticket.findFirst.mockResolvedValue({ ...mockTicket, status: 'PENDING' });
        mockPrisma.ticket.update.mockResolvedValue({ ...mockTicket, status: 'OPEN', assignedTo: 'user-1' });
        const result = await (0, ticket_service_js_1.updateTicket)(tenantId, 'ticket-1', { status: 'OPEN', assignedTo: 'user-1' });
        (0, vitest_1.expect)(result.status).toBe('OPEN');
    });
    (0, vitest_1.it)('invalid transition: OPEN → PENDING throws ValidationError', async () => {
        mockPrisma.ticket.findFirst.mockResolvedValue({ ...mockTicket, status: 'OPEN' });
        await (0, vitest_1.expect)((0, ticket_service_js_1.updateTicket)(tenantId, 'ticket-1', { status: 'PENDING' }))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('OPEN requires assignedTo — throws if missing', async () => {
        mockPrisma.ticket.findFirst.mockResolvedValue({ ...mockTicket, status: 'PENDING', assignedTo: null });
        await (0, vitest_1.expect)((0, ticket_service_js_1.updateTicket)(tenantId, 'ticket-1', { status: 'OPEN' }))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('closing sets closedAt', async () => {
        mockPrisma.ticket.findFirst.mockResolvedValue({ ...mockTicket, status: 'OPEN', assignedTo: 'user-1' });
        mockPrisma.ticket.update.mockResolvedValue({ ...mockTicket, status: 'CLOSED', closedAt: new Date() });
        await (0, ticket_service_js_1.updateTicket)(tenantId, 'ticket-1', { status: 'CLOSED' });
        (0, vitest_1.expect)(mockPrisma.ticket.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({ status: 'CLOSED', closedAt: vitest_1.expect.any(Date) }),
        }));
    });
    (0, vitest_1.it)('throws NotFoundError for non-existent ticket', async () => {
        mockPrisma.ticket.findFirst.mockResolvedValue(null);
        await (0, vitest_1.expect)((0, ticket_service_js_1.updateTicket)(tenantId, 'nope', { status: 'CLOSED' }))
            .rejects.toThrow(errors_js_1.NotFoundError);
    });
});
(0, vitest_1.describe)('ticket.service — markAsRead', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('sets unreadMessages to 0', async () => {
        mockPrisma.ticket.findFirst.mockResolvedValue(mockTicket);
        mockPrisma.ticket.update.mockResolvedValue({ ...mockTicket, unreadMessages: 0 });
        await (0, ticket_service_js_1.markAsRead)(tenantId, 'ticket-1');
        (0, vitest_1.expect)(mockPrisma.ticket.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: { id: 'ticket-1' },
            data: { unreadMessages: 0 },
        }));
    });
});
//# sourceMappingURL=ticket.service.test.js.map
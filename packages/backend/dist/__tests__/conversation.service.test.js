"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockPrisma, mockIO, mockAIQueue, mockOffhoursQueue, mockBusinessHours, mockTicketService } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        conversation: {
            findMany: vitest_1.vi.fn(),
            findFirst: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
            delete: vitest_1.vi.fn(),
            count: vitest_1.vi.fn(),
        },
        agent: { findFirst: vitest_1.vi.fn() },
        message: { create: vitest_1.vi.fn(), findMany: vitest_1.vi.fn(), deleteMany: vitest_1.vi.fn() },
        ticket: { findUnique: vitest_1.vi.fn(), update: vitest_1.vi.fn() },
        ticketTag: { deleteMany: vitest_1.vi.fn() },
        ticketRating: { deleteMany: vitest_1.vi.fn() },
        whatsAppSession: { findFirst: vitest_1.vi.fn() },
    },
    mockIO: {
        to: vitest_1.vi.fn(() => ({ emit: vitest_1.vi.fn() })),
    },
    mockAIQueue: { add: vitest_1.vi.fn() },
    mockOffhoursQueue: { add: vitest_1.vi.fn() },
    mockBusinessHours: { isWithinBusinessHours: vitest_1.vi.fn() },
    mockTicketService: {
        updateTicket: vitest_1.vi.fn(),
        closeTicket: vitest_1.vi.fn(),
        reopenTicket: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vitest_1.vi.mock('../lib/socket.js', () => ({ getIO: () => mockIO }));
vitest_1.vi.mock('../workers/queues.js', () => ({
    aiResponseQueue: mockAIQueue,
    offhoursMessageQueue: mockOffhoursQueue,
}));
vitest_1.vi.mock('../services/business-hours.service.js', () => ({ isWithinBusinessHours: mockBusinessHours.isWithinBusinessHours }));
vitest_1.vi.mock('../services/ticket.service.js', () => mockTicketService);
const conversation_service_js_1 = require("../services/conversation.service.js");
const errors_js_1 = require("../lib/errors.js");
const tenantId = 'tenant-1';
const conversationId = 'conv-1';
const userId = 'user-1';
const mockAgent = { id: 'agent-1', name: 'Bot', isActive: true };
const mockConversation = {
    id: conversationId, tenantId, agentId: 'agent-1', channel: 'WHATSAPP',
    contactName: 'Joao', contactPhone: '5511999999999', status: 'ACTIVE',
    assignedTo: null, agent: mockAgent,
};
(0, vitest_1.describe)('conversation.service — createConversation', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('creates conversation with default agent', async () => {
        mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
        mockPrisma.conversation.create.mockResolvedValue({
            ...mockConversation, include: { agent: { select: { id: true, name: true, model: true } }, _count: { select: { messages: true } } },
        });
        const result = await (0, conversation_service_js_1.createConversation)(tenantId, { channel: 'WHATSAPP', contactName: 'Joao' });
        (0, vitest_1.expect)(mockPrisma.conversation.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ data: vitest_1.expect.objectContaining({ tenantId, channel: 'WHATSAPP' }) }));
    });
    (0, vitest_1.it)('throws when no active agent found and none specified', async () => {
        mockPrisma.agent.findFirst.mockResolvedValue(null);
        await (0, vitest_1.expect)((0, conversation_service_js_1.createConversation)(tenantId, { channel: 'WHATSAPP', contactName: 'Joao' }))
            .rejects.toThrow(errors_js_1.ValidationError);
    });
});
(0, vitest_1.describe)('conversation.service — listConversations', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('returns paginated conversations', async () => {
        mockPrisma.conversation.findMany.mockResolvedValue([mockConversation]);
        mockPrisma.conversation.count.mockResolvedValue(1);
        const result = await (0, conversation_service_js_1.listConversations)(tenantId, { status: 'ACTIVE' });
        (0, vitest_1.expect)(result.conversations).toHaveLength(1);
        (0, vitest_1.expect)(result.count).toBe(1);
    });
});
(0, vitest_1.describe)('conversation.service — getConversation', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('throws NotFoundError for missing conversation', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue(null);
        await (0, vitest_1.expect)((0, conversation_service_js_1.getConversation)(tenantId, 'nope')).rejects.toThrow(errors_js_1.NotFoundError);
    });
    (0, vitest_1.it)('returns conversation with messages', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, messages: [] });
        const result = await (0, conversation_service_js_1.getConversation)(tenantId, conversationId);
        (0, vitest_1.expect)(result.id).toBe(conversationId);
    });
});
(0, vitest_1.describe)('conversation.service — escalateConversation', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('sets status to HUMAN_TAKEOVER and assigns user', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
        mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, status: 'HUMAN_TAKEOVER', assignedTo: userId });
        mockPrisma.message.create.mockResolvedValue({ id: 'msg-1', role: 'SYSTEM', content: 'Conversa escalonada' });
        mockPrisma.ticket.findUnique.mockResolvedValue(null);
        const result = await (0, conversation_service_js_1.escalateConversation)(tenantId, conversationId, userId);
        (0, vitest_1.expect)(mockPrisma.conversation.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ data: { status: 'HUMAN_TAKEOVER', assignedTo: userId } }));
    });
    (0, vitest_1.it)('updates ticket status when ticket exists', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
        mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, status: 'HUMAN_TAKEOVER', assignedTo: userId });
        mockPrisma.message.create.mockResolvedValue({ id: 'msg-1', role: 'SYSTEM', content: 'Conversa escalonada' });
        mockPrisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', conversationId });
        await (0, conversation_service_js_1.escalateConversation)(tenantId, conversationId, userId);
        (0, vitest_1.expect)(mockTicketService.updateTicket).toHaveBeenCalledWith(tenantId, 'ticket-1', { status: 'OPEN', assignedTo: userId });
    });
});
(0, vitest_1.describe)('conversation.service — returnToAgent', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('throws if conversation is not in HUMAN_TAKEOVER', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'ACTIVE' });
        await (0, vitest_1.expect)((0, conversation_service_js_1.returnToAgent)(tenantId, conversationId)).rejects.toThrow(errors_js_1.ValidationError);
    });
    (0, vitest_1.it)('returns to ACTIVE and reopens ticket', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'HUMAN_TAKEOVER', agent: mockAgent });
        mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, status: 'ACTIVE', assignedTo: null });
        mockPrisma.message.create.mockResolvedValue({ id: 'msg-2', role: 'SYSTEM' });
        mockPrisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', conversationId });
        await (0, conversation_service_js_1.returnToAgent)(tenantId, conversationId);
        (0, vitest_1.expect)(mockPrisma.conversation.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ data: { status: 'ACTIVE', assignedTo: null } }));
        (0, vitest_1.expect)(mockTicketService.reopenTicket).toHaveBeenCalled();
    });
});
(0, vitest_1.describe)('conversation.service — resolveConversation', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('sets status to RESOLVED and closes ticket', async () => {
        mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
        mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, status: 'RESOLVED' });
        mockPrisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', conversationId });
        await (0, conversation_service_js_1.resolveConversation)(tenantId, conversationId);
        (0, vitest_1.expect)(mockPrisma.conversation.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ data: { status: 'RESOLVED' } }));
        (0, vitest_1.expect)(mockTicketService.closeTicket).toHaveBeenCalledWith(tenantId, 'ticket-1');
    });
});
(0, vitest_1.describe)('conversation.service — getConversationStats', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.clearAllMocks(); });
    (0, vitest_1.it)('returns correct total', async () => {
        mockPrisma.conversation.count.mockResolvedValueOnce(10);
        mockPrisma.conversation.count.mockResolvedValueOnce(5);
        mockPrisma.conversation.count.mockResolvedValueOnce(3);
        mockPrisma.conversation.count.mockResolvedValueOnce(2);
        const stats = await (0, conversation_service_js_1.getConversationStats)(tenantId);
        (0, vitest_1.expect)(stats.total).toBe(20);
        (0, vitest_1.expect)(stats.active).toBe(10);
        (0, vitest_1.expect)(stats.pending).toBe(5);
        (0, vitest_1.expect)(stats.takeover).toBe(2);
    });
});
//# sourceMappingURL=conversation.service.test.js.map
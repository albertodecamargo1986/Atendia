import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockIO, mockAIQueue, mockOffhoursQueue, mockBusinessHours, mockTicketService, mockWa } = vi.hoisted(() => ({
  mockWa: {
    resolveConversationRoute: vi.fn(),
    outboundAdd: vi.fn(),
    scheduleAiResponse: vi.fn(),
    claimOnce: vi.fn(async () => true),
    resetAiReplyCounters: vi.fn(async () => {}),
  },
  mockPrisma: {
    conversation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    agent: { findFirst: vi.fn() },
    message: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    ticket: { findUnique: vi.fn(), update: vi.fn() },
    ticketTag: { deleteMany: vi.fn() },
    ticketRating: { deleteMany: vi.fn() },
    whatsAppSession: { findFirst: vi.fn() },
  },
  mockIO: {
    to: vi.fn(() => ({ emit: vi.fn() })),
  },
  mockAIQueue: { add: vi.fn() },
  mockOffhoursQueue: { add: vi.fn() },
  mockBusinessHours: { isWithinBusinessHours: vi.fn() },
  mockTicketService: {
    updateTicket: vi.fn(),
    closeTicket: vi.fn(),
    reopenTicket: vi.fn(),
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/socket.js', () => ({ getIO: () => mockIO }));
vi.mock('../workers/queues.js', () => ({
  aiResponseQueue: mockAIQueue,
  offhoursMessageQueue: mockOffhoursQueue,
  whatsappOutboundQueue: { add: mockWa.outboundAdd },
}));
vi.mock('../services/whatsapp.service.js', () => ({ resolveConversationRoute: mockWa.resolveConversationRoute }));
vi.mock('../lib/ai-schedule.js', () => ({ scheduleAiResponse: mockWa.scheduleAiResponse }));
vi.mock('../lib/wa-guards.js', () => ({
  claimOnce: mockWa.claimOnce,
  resetAiReplyCounters: mockWa.resetAiReplyCounters,
  TWELVE_HOURS_SEC: 43200,
}));
vi.mock('../services/business-hours.service.js', () => ({ isWithinBusinessHours: mockBusinessHours.isWithinBusinessHours }));
vi.mock('../services/ticket.service.js', () => mockTicketService);

import {
  createConversation,
  listConversations,
  getConversation,
  escalateConversation,
  returnToAgent,
  sendMessage,
  resolveConversation,
  getConversationStats,
} from '../services/conversation.service.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const tenantId = 'tenant-1';
const conversationId = 'conv-1';
const userId = 'user-1';

const mockAgent = { id: 'agent-1', name: 'Bot', isActive: true };
const mockConversation = {
  id: conversationId, tenantId, agentId: 'agent-1', channel: 'WHATSAPP',
  contactName: 'Joao', contactPhone: '5511999999999', status: 'ACTIVE',
  assignedTo: null, agent: mockAgent,
};

describe('conversation.service — createConversation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates conversation with default agent', async () => {
    mockPrisma.agent.findFirst.mockResolvedValue(mockAgent);
    mockPrisma.conversation.create.mockResolvedValue({
      ...mockConversation, include: { agent: { select: { id: true, name: true, model: true } }, _count: { select: { messages: true } } },
    });

    const result = await createConversation(tenantId, { channel: 'WHATSAPP', contactName: 'Joao' });
    expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId, channel: 'WHATSAPP' }) }),
    );
  });

  it('throws when no active agent found and none specified', async () => {
    mockPrisma.agent.findFirst.mockResolvedValue(null);
    await expect(createConversation(tenantId, { channel: 'WHATSAPP', contactName: 'Joao' }))
      .rejects.toThrow(ValidationError);
  });
});

describe('conversation.service — listConversations', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns paginated conversations', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([mockConversation]);
    mockPrisma.conversation.count.mockResolvedValue(1);

    const result = await listConversations(tenantId, { status: 'ACTIVE' });
    expect(result.conversations).toHaveLength(1);
    expect(result.count).toBe(1);
  });
});

describe('conversation.service — getConversation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws NotFoundError for missing conversation', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    await expect(getConversation(tenantId, 'nope')).rejects.toThrow(NotFoundError);
  });

  it('returns conversation with messages', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, messages: [] });
    const result = await getConversation(tenantId, conversationId);
    expect(result.id).toBe(conversationId);
  });
});

describe('conversation.service — escalateConversation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sets status to HUMAN_TAKEOVER and assigns user', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
    mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, status: 'HUMAN_TAKEOVER', assignedTo: userId });
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-1', role: 'SYSTEM', content: 'Conversa escalonada' });
    mockPrisma.ticket.findUnique.mockResolvedValue(null);

    const result = await escalateConversation(tenantId, conversationId, userId);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'HUMAN_TAKEOVER', assignedTo: userId } }),
    );
  });

  it('updates ticket status when ticket exists', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
    mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, status: 'HUMAN_TAKEOVER', assignedTo: userId });
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-1', role: 'SYSTEM', content: 'Conversa escalonada' });
    mockPrisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', conversationId });

    await escalateConversation(tenantId, conversationId, userId);
    expect(mockTicketService.updateTicket).toHaveBeenCalledWith(tenantId, 'ticket-1', { status: 'OPEN', assignedTo: userId });
  });
});

describe('conversation.service — returnToAgent', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws if conversation is not in HUMAN_TAKEOVER', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'ACTIVE' });
    await expect(returnToAgent(tenantId, conversationId)).rejects.toThrow(ValidationError);
  });

  it('returns to ACTIVE and reopens ticket', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'HUMAN_TAKEOVER', agent: mockAgent });
    mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, status: 'ACTIVE', assignedTo: null });
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-2', role: 'SYSTEM' });
    mockPrisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', conversationId });

    await returnToAgent(tenantId, conversationId);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE', assignedTo: null } }),
    );
    expect(mockTicketService.reopenTicket).toHaveBeenCalled();
  });
});

describe('conversation.service — resolveConversation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sets status to RESOLVED and closes ticket', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
    mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, status: 'RESOLVED' });
    mockPrisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', conversationId });

    await resolveConversation(tenantId, conversationId);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'RESOLVED' } }),
    );
    expect(mockTicketService.closeTicket).toHaveBeenCalledWith(tenantId, 'ticket-1');
  });
});

describe('conversation.service — getConversationStats', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns correct total', async () => {
    mockPrisma.conversation.count.mockResolvedValueOnce(10);
    mockPrisma.conversation.count.mockResolvedValueOnce(5);
    mockPrisma.conversation.count.mockResolvedValueOnce(3);
    mockPrisma.conversation.count.mockResolvedValueOnce(2);

    const stats = await getConversationStats(tenantId);
    expect(stats.total).toBe(20);
    expect(stats.active).toBe(10);
    expect(stats.pending).toBe(5);
    expect(stats.takeover).toBe(2);
  });
});

describe('conversation.service — sendMessage (operador e cliente)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.message.create.mockImplementation(async ({ data }: any) => ({ id: 'msg-op', ...data }));
    mockPrisma.ticket.findUnique.mockResolvedValue({ id: 'ticket-1', status: 'PENDING', assignedTo: null });
    mockPrisma.ticket.update.mockResolvedValue({});
    mockPrisma.conversation.update.mockImplementation(async ({ data }: any) => ({ ...mockConversation, ...data }));
    mockWa.resolveConversationRoute.mockResolvedValue({ sessionId: 'sess1', jid: '5511999999999@s.whatsapp.net' });
  });

  it('operador responde conversa da IA: vira HUMAN_TAKEOVER e envia pela rota da conversa', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'ACTIVE' });
    await sendMessage(tenantId, conversationId, { content: 'Oi, sou a Ana', role: 'ASSISTANT' }, userId);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({ where: { id: conversationId }, data: { status: 'HUMAN_TAKEOVER', assignedTo: userId } });
    expect(mockWa.outboundAdd).toHaveBeenCalledWith('send', expect.objectContaining({
      sessionId: 'sess1', jid: '5511999999999@s.whatsapp.net', content: 'Oi, sou a Ana', messageId: 'msg-op',
    }), { jobId: 'out-msg-op' });
    expect(mockWa.outboundAdd.mock.calls[0][1].automatic).toBeUndefined(); // humano: não é bloqueado por restrição
    expect(mockWa.scheduleAiResponse).not.toHaveBeenCalled();
  });

  it('operador em conversa PENDING (legado) também envia', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'PENDING' });
    await sendMessage(tenantId, conversationId, { content: 'Oi', role: 'ASSISTANT' }, userId);
    expect(mockWa.outboundAdd).toHaveBeenCalledTimes(1);
  });

  it('conversa encerrada (RESOLVED): recusa sem gravar nem enviar', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'RESOLVED' });
    await expect(sendMessage(tenantId, conversationId, { content: 'Oi', role: 'ASSISTANT' }, userId)).rejects.toThrow(ValidationError);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(mockWa.outboundAdd).not.toHaveBeenCalled();
  });

  it('sem rota (contato sem WhatsApp identificável): erro e nada gravado', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'HUMAN_TAKEOVER' });
    mockWa.resolveConversationRoute.mockResolvedValue(null);
    await expect(sendMessage(tenantId, conversationId, { content: 'Oi', role: 'ASSISTANT' }, userId)).rejects.toThrow(ValidationError);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it('arquivo de outro tenant é recusado', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'HUMAN_TAKEOVER' });
    await expect(sendMessage(tenantId, conversationId, { content: 'x.pdf', role: 'ASSISTANT', mediaUrl: '/uploads/outro-tenant/x.pdf', mediaType: 'DOCUMENT' }, userId))
      .rejects.toThrow(ValidationError);
  });

  it('mensagem de cliente pela API (sem operador): agenda a IA com debounce', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'ACTIVE' });
    mockBusinessHours.isWithinBusinessHours.mockResolvedValue(true);
    await sendMessage(tenantId, conversationId, { content: 'oi', role: 'USER' });
    expect(mockWa.scheduleAiResponse).toHaveBeenCalledWith({ tenantId, conversationId, agentId: 'agent-1', triggerMessageId: 'msg-op' });
    expect(mockAIQueue.add).not.toHaveBeenCalled();
  });
});

describe('conversation.service — returnToAgent aceita PENDING (legado) e zera o anti-loop', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('PENDING volta para ACTIVE', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, status: 'PENDING', agent: mockAgent });
    mockPrisma.conversation.update.mockResolvedValue({ ...mockConversation, status: 'ACTIVE' });
    mockPrisma.message.create.mockResolvedValue({ id: 'm', role: 'SYSTEM' });
    mockPrisma.ticket.findUnique.mockResolvedValue(null);
    await returnToAgent(tenantId, conversationId);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ACTIVE', assignedTo: null } }));
    expect(mockWa.resetAiReplyCounters).toHaveBeenCalledWith(conversationId);
  });
});

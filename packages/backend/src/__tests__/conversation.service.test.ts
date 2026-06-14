import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockIO, mockAIQueue, mockOffhoursQueue, mockBusinessHours, mockTicketService } = vi.hoisted(() => ({
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
}));
vi.mock('../services/business-hours.service.js', () => ({ isWithinBusinessHours: mockBusinessHours.isWithinBusinessHours }));
vi.mock('../services/ticket.service.js', () => mockTicketService);

import {
  createConversation,
  listConversations,
  getConversation,
  escalateConversation,
  returnToAgent,
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

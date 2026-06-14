import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create transaction mock that the $transaction callback will receive
const mockTx = {
  ticket: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
};

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    ticket: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn, opts) => {
      if (typeof fn === 'function') return fn(mockTx);
      return Promise.all(fn);
    }),
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/socket.js', () => ({
  getIO: vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })) })),
}));
vi.mock('../services/ticket.dispatcher.js', () => ({
  dispatchTicket: vi.fn(),
}));

import { findOrCreateTicket, updateTicket, markAsRead } from '../services/ticket.service.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

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

describe('ticket.service — findOrCreateTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset transaction mock
    mockPrisma.$transaction.mockImplementation((fn, opts) => {
      if (typeof fn === 'function') return fn(mockTx);
      return Promise.all(fn);
    });
  });

  it('returns existing open ticket and increments unread', async () => {
    const existing = { ...mockTicket, status: 'OPEN', id: 'ticket-open' };
    mockTx.ticket.findFirst.mockResolvedValue(existing);
    mockTx.ticket.update.mockResolvedValue({ ...existing, unreadMessages: 3 });
    mockTx.ticket.findUnique.mockResolvedValue({ ...existing, unreadMessages: 3 });

    await findOrCreateTicket(tenantId, contactId, conversationId, null, 2, 'Oi', false);

    expect(mockTx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-open' },
        data: expect.objectContaining({ unreadMessages: { increment: 2 } }),
      }),
    );
  });

  it('reopens recently closed ticket (<2h)', async () => {
    const closedTicket = { ...mockTicket, status: 'CLOSED', id: 'ticket-closed', updatedAt: new Date(), closedAt: new Date() };

    mockTx.ticket.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(closedTicket);
    const reopened = { ...closedTicket, status: 'PENDING', assignedTo: null, closedAt: null };
    mockTx.ticket.update.mockResolvedValue(reopened);
    mockTx.ticket.findUnique.mockResolvedValue(reopened);

    await findOrCreateTicket(tenantId, contactId, conversationId, null, 1, 'Oi de novo', false);

    expect(mockTx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-closed' },
        data: expect.objectContaining({ status: 'PENDING', assignedTo: null, closedAt: null }),
      }),
    );
  });

  it('creates new ticket when none exists', async () => {
    const newTicket = { ...mockTicket, id: 'ticket-new' };

    mockTx.ticket.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockTx.ticket.create.mockResolvedValue(newTicket);

    await findOrCreateTicket(tenantId, contactId, conversationId, 'session-1', 1, 'Nova msg', false);

    expect(mockTx.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId, contactId, conversationId, status: 'PENDING' }),
      }),
    );
  });

  it('passes serializable isolation level to $transaction', async () => {
    mockTx.ticket.findFirst.mockResolvedValue(null);
    mockTx.ticket.create.mockResolvedValue(mockTicket);

    await findOrCreateTicket(tenantId, contactId, conversationId, null, 1, 'Test', false);

    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
  });
});

describe('ticket.service — updateTicket (state machine)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('valid transition: PENDING → OPEN with assignedTo', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue({ ...mockTicket, status: 'PENDING' });
    mockPrisma.ticket.update.mockResolvedValue({ ...mockTicket, status: 'OPEN', assignedTo: 'user-1' });

    const result = await updateTicket(tenantId, 'ticket-1', { status: 'OPEN', assignedTo: 'user-1' });
    expect(result.status).toBe('OPEN');
  });

  it('invalid transition: OPEN → PENDING throws ValidationError', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue({ ...mockTicket, status: 'OPEN' });

    await expect(updateTicket(tenantId, 'ticket-1', { status: 'PENDING' }))
      .rejects.toThrow(ValidationError);
  });

  it('OPEN requires assignedTo — throws if missing', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue({ ...mockTicket, status: 'PENDING', assignedTo: null });

    await expect(updateTicket(tenantId, 'ticket-1', { status: 'OPEN' }))
      .rejects.toThrow(ValidationError);
  });

  it('closing sets closedAt', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue({ ...mockTicket, status: 'OPEN', assignedTo: 'user-1' });
    mockPrisma.ticket.update.mockResolvedValue({ ...mockTicket, status: 'CLOSED', closedAt: new Date() });

    await updateTicket(tenantId, 'ticket-1', { status: 'CLOSED' });

    expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CLOSED', closedAt: expect.any(Date) }),
      }),
    );
  });

  it('throws NotFoundError for non-existent ticket', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue(null);

    await expect(updateTicket(tenantId, 'nope', { status: 'CLOSED' }))
      .rejects.toThrow(NotFoundError);
  });
});

describe('ticket.service — markAsRead', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sets unreadMessages to 0', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue(mockTicket);
    mockPrisma.ticket.update.mockResolvedValue({ ...mockTicket, unreadMessages: 0 });

    await markAsRead(tenantId, 'ticket-1');
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-1' },
        data: { unreadMessages: 0 },
      }),
    );
  });
});

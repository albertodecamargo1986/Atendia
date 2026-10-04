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
    // updateTicket valida atendente/fila do mesmo tenant (IDOR)
    user: { findFirst: vi.fn(() => Promise.resolve({ id: 'user-1' })) },
    conversation: { findFirst: vi.fn(), update: vi.fn() },
    queue: { findFirst: vi.fn(() => Promise.resolve({ id: 'queue-1' })) },
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
const { mockWebhook } = vi.hoisted(() => ({ mockWebhook: vi.fn() }));
vi.mock('../services/webhook.service.js', () => ({ emitWebhookEvent: mockWebhook }));

import { findOrCreateTicket, updateTicket, markAsRead, listTickets, getTicketStats, closeTicket, reopenTicket } from '../services/ticket.service.js';
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

describe('ticket.service — findOrCreateTicket (cliente voltando nunca gera P2002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((fn, opts) => {
      if (typeof fn === 'function') return fn(mockTx);
      return Promise.all(fn);
    });
    mockTx.ticket.findUnique.mockReset();
    mockTx.ticket.findFirst.mockReset();
  });

  it('ticket da própria conversa aberto: só atualiza (existing, created=false)', async () => {
    const own = { ...mockTicket, status: 'OPEN', id: 'ticket-open' };
    mockTx.ticket.findUnique.mockResolvedValue(own);
    const res = await findOrCreateTicket(tenantId, contactId, conversationId, null, 2, 'Oi', false);
    expect(mockTx.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ticket-open' },
      data: expect.objectContaining({ unreadMessages: { increment: 2 } }),
    }));
    expect(res).toMatchObject({ outcome: 'existing', created: false });
    expect(mockTx.ticket.create).not.toHaveBeenCalled();
  });

  it('cliente volta depois de ENCERRAR (ticket da conversa CLOSED, qualquer idade): reabre em vez de criar', async () => {
    const closed = { ...mockTicket, status: 'CLOSED', id: 'ticket-closed', updatedAt: new Date('2020-01-01') };
    mockTx.ticket.findUnique.mockResolvedValueOnce(closed).mockResolvedValue({ ...closed, status: 'PENDING' });
    const res = await findOrCreateTicket(tenantId, contactId, conversationId, 'wa1', 1, 'Oi de novo', false);
    expect(mockTx.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ticket-closed' },
      data: expect.objectContaining({ status: 'PENDING', assignedTo: null, closedAt: null, whatsappSessionId: 'wa1' }),
    }));
    expect(mockTx.ticket.create).not.toHaveBeenCalled();
    expect(res).toMatchObject({ outcome: 'reopened', created: false });
  });

  it('ticket aberto do contato em OUTRA conversa: passa a apontar para a conversa nova', async () => {
    mockTx.ticket.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ ...mockTicket, id: 'ticket-x' });
    mockTx.ticket.findFirst.mockResolvedValueOnce({ ...mockTicket, id: 'ticket-x', conversationId: 'conv-velha', status: 'OPEN' });
    await findOrCreateTicket(tenantId, contactId, conversationId, null, 1, 'Oi', false);
    expect(mockTx.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ticket-x' },
      data: expect.objectContaining({ conversationId }),
    }));
    expect(mockTx.ticket.create).not.toHaveBeenCalled();
  });

  it('encerrado há < 2 h em outra conversa: reabre e aponta para a conversa nova', async () => {
    mockTx.ticket.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ ...mockTicket, id: 'ticket-recent' });
    mockTx.ticket.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...mockTicket, id: 'ticket-recent', status: 'CLOSED' });
    const res = await findOrCreateTicket(tenantId, contactId, conversationId, null, 1, 'Oi', false);
    expect(mockTx.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ticket-recent' },
      data: expect.objectContaining({ status: 'PENDING', conversationId }),
    }));
    expect(res.outcome).toBe('reopened');
  });

  it('sem nenhum ticket: cria (created=true) e dispara webhook ticket.created', async () => {
    mockTx.ticket.findUnique.mockResolvedValue(null);
    mockTx.ticket.findFirst.mockResolvedValue(null);
    mockTx.ticket.create.mockResolvedValue({ ...mockTicket, id: 'ticket-new' });
    const res = await findOrCreateTicket(tenantId, contactId, conversationId, 'session-1', 1, 'Nova msg', false);
    expect(mockTx.ticket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId, contactId, conversationId, status: 'PENDING' }),
    }));
    expect(res.created).toBe(true);
    expect(mockWebhook).toHaveBeenCalledWith(tenantId, 'ticket.created', expect.objectContaining({ ticketId: 'ticket-new' }));
  });

  it('corrida (P2002) na criação: tenta de novo e encontra o ticket criado pela outra mensagem', async () => {
    let first = true;
    mockPrisma.$transaction.mockImplementation((fn: any) => {
      if (first) {
        first = false;
        return Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' }));
      }
      return fn(mockTx);
    });
    mockTx.ticket.findUnique.mockResolvedValue({ ...mockTicket, status: 'PENDING' });
    const res = await findOrCreateTicket(tenantId, contactId, conversationId, null, 1, 'Oi', false);
    expect(res.outcome).toBe('existing');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('usa isolamento Serializable', async () => {
    mockTx.ticket.findUnique.mockResolvedValue(null);
    mockTx.ticket.findFirst.mockResolvedValue(null);
    mockTx.ticket.create.mockResolvedValue(mockTicket);
    await findOrCreateTicket(tenantId, contactId, conversationId, null, 1, 'Test', false);
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
});

describe('ticket.service — encerrar devolve a conversa / reabrir reativa', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('closeTicket: ticket CLOSED + conversa RESOLVED + webhook ticket.closed', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue({ ...mockTicket, status: 'OPEN', assignedTo: 'user-1' });
    mockPrisma.ticket.update.mockResolvedValue({ ...mockTicket, status: 'CLOSED', closedAt: new Date() });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: conversationId, status: 'HUMAN_TAKEOVER' });
    mockPrisma.conversation.update.mockResolvedValue({ id: conversationId, status: 'RESOLVED' });
    await closeTicket(tenantId, 'ticket-1');
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({ where: { id: conversationId }, data: { status: 'RESOLVED', assignedTo: null } });
    expect(mockWebhook).toHaveBeenCalledWith(tenantId, 'ticket.closed', expect.objectContaining({ ticketId: 'ticket-1' }));
  });

  it('reopenTicket: conversa RESOLVED volta para a IA (ACTIVE)', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue({ ...mockTicket, status: 'CLOSED' });
    mockPrisma.ticket.update.mockResolvedValue({ ...mockTicket, status: 'PENDING' });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: conversationId, status: 'RESOLVED' });
    mockPrisma.conversation.update.mockResolvedValue({ id: conversationId, status: 'ACTIVE' });
    await reopenTicket(tenantId, 'ticket-1');
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({ where: { id: conversationId }, data: { status: 'ACTIVE' } });
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

describe('ticket.service — listTickets (filtro aiStatus)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    mockPrisma.ticket.count.mockResolvedValue(0);
  });

  const lastWhere = () => mockPrisma.ticket.findMany.mock.calls[0][0].where;

  it('sem aiStatus não filtra pela conversa', async () => {
    await listTickets(tenantId, { status: 'PENDING' });
    expect(lastWhere()).toEqual({ tenantId, status: 'PENDING' });
  });

  it('aiStatus=ACTIVE filtra conversas com a IA atendendo', async () => {
    await listTickets(tenantId, { aiStatus: 'ACTIVE', status: ['PENDING', 'OPEN'] });
    expect(lastWhere()).toEqual({
      tenantId,
      status: { in: ['PENDING', 'OPEN'] },
      conversation: { status: 'ACTIVE' },
    });
    // a contagem usa o mesmo filtro da lista
    expect(mockPrisma.ticket.count).toHaveBeenCalledWith({ where: lastWhere() });
  });

  it('aiStatus com um só valor na lista vira igualdade simples', async () => {
    await listTickets(tenantId, { aiStatus: ['HUMAN_TAKEOVER'] });
    expect(lastWhere().conversation).toEqual({ status: 'HUMAN_TAKEOVER' });
  });

  it('aiStatus com vários valores vira { in } e convive com a busca e o atendente', async () => {
    await listTickets(tenantId, { aiStatus: ['HUMAN_TAKEOVER', 'PENDING'], assignedTo: 'user-1', search: 'joao' });
    const where = lastWhere();
    expect(where.conversation).toEqual({ status: { in: ['HUMAN_TAKEOVER', 'PENDING'] } });
    expect(where.assignedTo).toBe('user-1');
    expect(where.OR).toHaveLength(3);
  });

  it('lista vazia de aiStatus é ignorada', async () => {
    await listTickets(tenantId, { aiStatus: [] });
    expect(lastWhere()).toEqual({ tenantId });
  });

  it('devolve o status da conversa junto de cada atendimento', async () => {
    await listTickets(tenantId, {});
    const include = mockPrisma.ticket.findMany.mock.calls[0][0].include;
    expect(include.conversation.select.status).toBe(true);
  });
});

describe('ticket.service — getTicketStats', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('conta IA atendendo, aguardando pessoa e "comigo" só entre atendimentos em andamento', async () => {
    mockPrisma.ticket.count.mockResolvedValue(2);
    const stats = await getTicketStats(tenantId, 'user-1');

    expect(stats).toMatchObject({ pending: 2, open: 2, closed: 2, total: 6, aiActive: 2, waitingHuman: 2, mine: 2 });
    const wheres = mockPrisma.ticket.count.mock.calls.map((c: any[]) => c[0].where);
    const active = { in: ['PENDING', 'OPEN'] };
    expect(wheres).toContainEqual({ tenantId, status: active, conversation: { status: 'ACTIVE' } });
    expect(wheres).toContainEqual({ tenantId, status: active, conversation: { status: { in: ['HUMAN_TAKEOVER', 'PENDING'] } } });
    expect(wheres).toContainEqual({ tenantId, status: active, assignedTo: 'user-1' });
  });

  it('sem usuário, "comigo" é 0 e não consulta o banco para isso', async () => {
    mockPrisma.ticket.count.mockResolvedValue(1);
    const stats = await getTicketStats(tenantId);
    expect(stats.mine).toBe(0);
    expect(mockPrisma.ticket.count).toHaveBeenCalledTimes(6);
  });
});

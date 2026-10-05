/**
 * P0-1: "Devolver para a IA" depois que um operador ASSUMIU (ticket OPEN) — com o
 * ticket.service REAL (sem mockar reopenTicket), para a máquina de estados ser exercitada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mocks } = vi.hoisted(() => ({
  mockPrisma: {
    conversation: { findFirst: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
    ticket: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
    queue: { findFirst: vi.fn() },
  },
  mocks: { dispatchTicket: vi.fn(), emit: vi.fn(), resetAiReplyCounters: vi.fn(async () => {}) },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/socket.js', () => ({ getIO: () => ({ to: () => ({ emit: mocks.emit }) }) }));
vi.mock('../services/ticket.dispatcher.js', () => ({ dispatchTicket: mocks.dispatchTicket }));
vi.mock('../services/webhook.service.js', () => ({ emitWebhookEvent: vi.fn() }));
vi.mock('../services/whatsapp.service.js', () => ({ resolveConversationRoute: vi.fn(), getActiveSocket: vi.fn() }));
vi.mock('../workers/queues.js', () => ({ offhoursMessageQueue: { add: vi.fn() }, whatsappOutboundQueue: { add: vi.fn() } }));
vi.mock('../lib/ai-schedule.js', () => ({ scheduleAiResponse: vi.fn() }));
vi.mock('../lib/wa-guards.js', () => ({ claimOnce: vi.fn(), resetAiReplyCounters: mocks.resetAiReplyCounters, TWELVE_HOURS_SEC: 43200 }));
vi.mock('../services/business-hours.service.js', () => ({ isWithinBusinessHours: vi.fn() }));

import { returnToAgent } from '../services/conversation.service.js';
import { acceptTicket } from '../services/ticket.service.js';

const tenantId = 't1';
const conversation = { id: 'cv1', tenantId, status: 'HUMAN_TAKEOVER', assignedTo: 'op1', agent: { id: 'ag1', isActive: true } };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.conversation.findFirst.mockImplementation(async (args: any) =>
    args?.select ? { id: 'cv1', status: 'ACTIVE' } : conversation);
  mockPrisma.conversation.update.mockImplementation(async ({ data }: any) => ({ ...conversation, ...data }));
  mockPrisma.message.create.mockResolvedValue({ id: 'sys' });
  mockPrisma.ticket.findUnique.mockResolvedValue({ id: 'tk1', conversationId: 'cv1', status: 'OPEN', assignedTo: 'op1' });
  mockPrisma.ticket.findFirst.mockResolvedValue({ id: 'tk1', tenantId, conversationId: 'cv1', status: 'OPEN', assignedTo: 'op1' });
  mockPrisma.ticket.update.mockImplementation(async ({ data }: any) => ({ id: 'tk1', conversationId: 'cv1', ...data }));
});

describe('P0-1 — devolver para a IA com ticket OPEN (operador tinha assumido)', () => {
  it('não falha (antes: 400 OPEN → PENDING): conversa ACTIVE, ticket PENDING sem atendente e redistribuído', async () => {
    await expect(returnToAgent(tenantId, 'cv1')).resolves.toMatchObject({ status: 'ACTIVE' });
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tk1' },
      data: expect.objectContaining({ status: 'PENDING', assignedTo: null, closedAt: null }),
    }));
    expect(mocks.dispatchTicket).toHaveBeenCalledWith(tenantId, 'tk1');
    expect(mocks.resetAiReplyCounters).toHaveBeenCalledWith('cv1');
  });
});

describe('P2-12 — aceitar atendimento pausa a IA', () => {
  it('ticket PENDING aceito: conversa vira HUMAN_TAKEOVER com o atendente', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue({ id: 'tk1', tenantId, conversationId: 'cv1', status: 'PENDING', assignedTo: null });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'op2' });
    await acceptTicket(tenantId, 'tk1', 'op2');
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'cv1' }, data: { status: 'HUMAN_TAKEOVER', assignedTo: 'op2' } });
  });
});

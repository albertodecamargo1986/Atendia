import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockQueue } = vi.hoisted(() => ({
  mockPrisma: {
    contact: { findMany: vi.fn() },
    campaign: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
  mockQueue: { add: vi.fn(), addBulk: vi.fn() },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../lib/redis.js', () => ({ default: {} }));
vi.mock('bullmq', () => ({ Queue: vi.fn(() => mockQueue) }));

import { createCampaign, startCampaign, randomCampaignDelay } from '../services/campaign.service.js';
import { ValidationError, ConflictError } from '../lib/errors.js';

const tenantId = 'tenant-1';

describe('campaign.service — createCampaign (IDOR)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejeita contactIds de outro tenant', async () => {
    // Só 1 dos 2 contatos pertence ao tenant
    mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c-meu' }]);

    await expect(createCampaign(tenantId, 'Promo', 'Oi!', ['c-meu', 'c-de-outro-tenant']))
      .rejects.toThrow(ValidationError);

    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['c-meu', 'c-de-outro-tenant'] }, tenantId },
    }));
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('cria campanha quando todos os contatos são do tenant (sem duplicados)', async () => {
    mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    mockPrisma.campaign.create.mockResolvedValue({ id: 'camp-1', recipients: [] });

    await createCampaign(tenantId, 'Promo', 'Oi!', ['c1', 'c2', 'c1']);
    expect(mockPrisma.campaign.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId, totalRecipients: 2 }),
    }));
  });
});

describe('campaign.service — startCampaign', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('não inicia campanha CANCELLED', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: 'camp-1', status: 'CANCELLED', recipients: [] });
    await expect(startCampaign('camp-1', tenantId)).rejects.toThrow(ConflictError);
    expect(mockPrisma.campaign.update).not.toHaveBeenCalled();
  });

  it('espaça os envios entre 3 e 8 segundos', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1', status: 'DRAFT', message: 'Oi',
      recipients: [1, 2, 3].map((n) => ({ id: 'r' + n, contactId: 'c' + n, status: 'PENDING', contact: { phone: '55119999900' + n } })),
    });
    mockPrisma.campaign.update.mockResolvedValue({});

    await startCampaign('camp-1', tenantId);
    const jobs = mockQueue.addBulk.mock.calls[0][0];
    const delays = jobs.map((j: any) => j.opts.delay);
    expect(delays[0]).toBe(0);
    for (let i = 1; i < delays.length; i++) {
      const gap = delays[i] - delays[i - 1];
      expect(gap).toBeGreaterThanOrEqual(3000);
      expect(gap).toBeLessThanOrEqual(8000);
    }
  });

  it('randomCampaignDelay fica entre 3 e 8 s', () => {
    expect(randomCampaignDelay(() => 0)).toBe(3000);
    expect(randomCampaignDelay(() => 0.9999)).toBeLessThanOrEqual(8000);
  });
});

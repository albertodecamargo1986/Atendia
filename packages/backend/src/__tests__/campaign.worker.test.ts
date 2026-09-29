import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/redis.js', () => ({ default: {} }));
vi.mock('../lib/prisma.js', () => ({ default: {} }));
vi.mock('bullmq', () => ({ Worker: vi.fn(), Queue: vi.fn() }));
vi.mock('../services/whatsapp.service.js', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/campaign.service.js', () => ({
  markRecipientSent: vi.fn(),
  markRecipientFailed: vi.fn(),
  checkCampaignCompletion: vi.fn(),
  startCampaign: vi.fn(),
}));

import { campaignRecipientJid } from '../workers/campaign.worker.js';

describe('campaign.worker — JID', () => {
  it('envia para @s.whatsapp.net', () => {
    expect(campaignRecipientJid('5511988887777')).toBe('5511988887777@s.whatsapp.net');
    expect(campaignRecipientJid('5511988887777')).not.toContain('@s.whats.net');
  });
});

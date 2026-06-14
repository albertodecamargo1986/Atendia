import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    contact: {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn(),
    },
    conversation: { findFirst: vi.fn() },
  },
}));

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));

import { findOrCreateContact, quickSaveFromConversation, createContact } from '../services/contact.service.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const tenantId = 'tenant-1';
const phone = '5511999999999';

const mockContact = {
  id: 'contact-1', tenantId, phone, name: 'Joao Silva',
  email: '', profilePicUrl: null, isGroup: false, lid: null,
};

describe('contact.service — findOrCreateContact', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('updates existing contact via upsert', async () => {
    mockPrisma.contact.upsert.mockResolvedValue({
      ...mockContact, name: 'Joao Updated', profilePicUrl: 'https://pic.url/joao',
    });

    const result = await findOrCreateContact(tenantId, phone, 'Joao Updated', 'https://pic.url/joao', false, 'lid-123');

    expect(mockPrisma.contact.upsert).toHaveBeenCalledWith({
      where: { tenantId_phone: { tenantId, phone } },
      update: expect.objectContaining({
        name: 'Joao Updated', profilePicUrl: 'https://pic.url/joao', lid: 'lid-123',
      }),
      create: expect.objectContaining({ tenantId, phone, name: 'Joao Updated' }),
    });
  });

  it('creates new contact when phone does not exist', async () => {
    mockPrisma.contact.upsert.mockResolvedValue(mockContact);

    await findOrCreateContact(tenantId, '5511988887777', 'Maria', undefined, false);

    expect(mockPrisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_phone: { tenantId, phone: '5511988887777' } },
        create: expect.objectContaining({ name: 'Maria' }),
      }),
    );
  });

  it('does not update name when it equals phone (fallback)', async () => {
    mockPrisma.contact.upsert.mockResolvedValue(mockContact);

    await findOrCreateContact(tenantId, phone, phone, undefined, false);

    expect(mockPrisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ name: undefined }),
      }),
    );
  });
});

describe('contact.service — quickSaveFromConversation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const mockConversation = {
    id: 'conv-1', tenantId, contactPhone: phone,
    contactName: 'Joao', contactEmail: 'joao@test.com',
  };

  it('updates existing contact with whitelisted fields only', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
    mockPrisma.contact.findUnique.mockResolvedValue(mockContact);
    mockPrisma.contact.update.mockResolvedValue({ ...mockContact, cpfCnpj: '12345678901', city: 'Sao Paulo' });

    await quickSaveFromConversation(tenantId, 'conv-1', {
      cpfCnpj: '12345678901', city: 'Sao Paulo',
    });

    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { cpfCnpj: '12345678901', city: 'Sao Paulo' },
      }),
    );
  });

  it('ignores non-whitelisted fields', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
    mockPrisma.contact.findUnique.mockResolvedValue(mockContact);
    mockPrisma.contact.update.mockResolvedValue(mockContact);

    await quickSaveFromConversation(tenantId, 'conv-1', {
      cpfCnpj: '12345678901', role: 'admin', maliciousField: 'hacked',
    });

    const updateData = mockPrisma.contact.update.mock.calls[0][0].data;
    expect(updateData).toHaveProperty('cpfCnpj');
    expect(updateData).toHaveProperty('role');
    expect(updateData).not.toHaveProperty('maliciousField');
  });

  it('creates contact if conversation has no existing contact', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
    mockPrisma.contact.findUnique.mockResolvedValue(null);
    mockPrisma.contact.create.mockResolvedValue(mockContact);

    await quickSaveFromConversation(tenantId, 'conv-1');

    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId, phone, name: 'Joao' }),
      }),
    );
  });

  it('throws NotFoundError for non-existent conversation', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    await expect(quickSaveFromConversation(tenantId, 'nope')).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError for conversation without phone', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...mockConversation, contactPhone: null });
    await expect(quickSaveFromConversation(tenantId, 'conv-1')).rejects.toThrow(ValidationError);
  });
});

describe('contact.service — createContact (schema validation)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects phone with less than 10 digits', async () => {
    await expect(createContact(tenantId, { phone: '11999', name: 'Bad Phone', email: '', isGroup: false })).rejects.toThrow();
  });

  it('rejects empty name', async () => {
    await expect(createContact(tenantId, { phone: '5511999999999', name: '', email: '', isGroup: false })).rejects.toThrow();
  });

  it('rejects invalid email format', async () => {
    await expect(createContact(tenantId, { phone: '5511999999999', name: 'Bad', email: 'not-an-email', isGroup: false })).rejects.toThrow();
  });

  it('creates contact with valid data', async () => {
    mockPrisma.contact.create.mockResolvedValue(mockContact);
    await createContact(tenantId, { phone: '5511999999999', name: 'Joao Silva', email: 'joao@test.com', isGroup: false });
    expect(mockPrisma.contact.create).toHaveBeenCalled();
  });
});

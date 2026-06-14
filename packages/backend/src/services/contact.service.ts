import prisma from '../lib/prisma.js';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const createContactSchema = z.object({
  phone: z.string().min(10, 'Telefone inválido'),
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email().optional().default(''),
  profilePicUrl: z.string().url().optional(),
  isGroup: z.boolean().default(false),
  lid: z.string().optional(),
  cpfCnpj: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  notes: z.string().optional(),
});

export async function createContact(tenantId: string, data: z.infer<typeof createContactSchema>) {
  const parsed = createContactSchema.parse(data);
  return prisma.contact.create({
    data: { tenantId, ...parsed },
  });
}

export async function findOrCreateContact(
  tenantId: string,
  phone: string,
  name: string,
  profilePicUrl?: string,
  isGroup?: boolean,
  lid?: string
) {
  return prisma.contact.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    update: {
      name: name !== phone ? name : undefined,
      profilePicUrl: profilePicUrl || undefined,
      lid: lid || undefined,
    },
    create: {
      tenantId,
      phone,
      name,
      profilePicUrl,
      isGroup: isGroup || false,
      lid,
    },
  });
}

export async function quickSaveFromConversation(tenantId: string, conversationId: string, extraData?: Record<string, string>) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
  });
  if (!conversation) throw new NotFoundError('Conversa', conversationId);
  if (!conversation.contactPhone) throw new ValidationError('Conversa não tem telefone do contato');

  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['cpfCnpj', 'address', 'city', 'state', 'zipCode', 'company', 'role', 'notes'];
  const safeExtraData: Record<string, string> = {};
  if (extraData) {
    for (const key of allowedFields) {
      if (extraData[key] !== undefined) {
        safeExtraData[key] = extraData[key];
      }
    }
  }

  const existing = await prisma.contact.findUnique({
    where: { tenantId_phone: { tenantId, phone: conversation.contactPhone } },
  });

  if (existing) {
    return prisma.contact.update({
      where: { id: existing.id },
      data: { ...safeExtraData },
    });
  }

  return prisma.contact.create({
    data: {
      tenantId,
      phone: conversation.contactPhone,
      name: conversation.contactName || conversation.contactPhone,
      email: conversation.contactEmail || '',
      ...safeExtraData,
    },
  });
}

export async function listContacts(
  tenantId: string,
  filters?: { search?: string; page?: number }
) {
  const page = filters?.page || 1;
  const limit = 40;
  const offset = limit * (page - 1);

  const where: any = { tenantId };

  if (filters?.search) {
    const search = filters.search.toLowerCase();
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { cpfCnpj: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [contacts, count] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: { _count: { select: { tickets: true } } },
    }),
    prisma.contact.count({ where }),
  ]);

  return { contacts, count, hasMore: count > offset + contacts.length };
}

export async function getContact(tenantId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
    include: {
      tickets: {
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: {
          assignee: { select: { id: true, name: true } },
          queue: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });
  if (!contact) throw new NotFoundError('Contato', contactId);
  return contact;
}

export async function updateContact(
  tenantId: string,
  contactId: string,
  data: {
    name?: string; email?: string; profilePicUrl?: string;
    cpfCnpj?: string; address?: string; city?: string; state?: string;
    zipCode?: string; company?: string; role?: string; notes?: string;
  }
) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
  });
  if (!contact) throw new NotFoundError('Contato', contactId);

  return prisma.contact.update({
    where: { id: contactId },
    data,
  });
}

export async function deleteContact(tenantId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId } });
  if (!contact) throw new NotFoundError('Contato', contactId);
  return prisma.contact.delete({ where: { id: contactId } });
}

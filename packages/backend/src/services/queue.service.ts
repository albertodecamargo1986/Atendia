import prisma from '../lib/prisma.js';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const createQueueSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
  greetingMessage: z.string().optional(),
});

const updateQueueSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  greetingMessage: z.string().nullable().optional(),
});

export async function createQueue(
  tenantId: string,
  data: z.infer<typeof createQueueSchema>
) {
  const parsed = createQueueSchema.parse(data);

  return prisma.queue.create({
    data: {
      tenantId,
      name: parsed.name,
      color: parsed.color,
      greetingMessage: parsed.greetingMessage,
    },
  });
}

export async function updateQueue(
  tenantId: string,
  queueId: string,
  data: z.infer<typeof updateQueueSchema>
) {
  const queue = await prisma.queue.findFirst({ where: { id: queueId, tenantId } });
  if (!queue) throw new NotFoundError('Fila', queueId);

  const parsed = updateQueueSchema.parse(data);
  return prisma.queue.update({
    where: { id: queueId },
    data: parsed,
  });
}

export async function deleteQueue(tenantId: string, queueId: string) {
  const queue = await prisma.queue.findFirst({ where: { id: queueId, tenantId } });
  if (!queue) throw new NotFoundError('Fila', queueId);

  const openTickets = await prisma.ticket.count({
    where: { queueId, status: { in: ['PENDING', 'OPEN'] } },
  });
  if (openTickets > 0) {
    throw new ValidationError(`Não é possível remover fila com ${openTickets} ticket(s) aberto(s)`);
  }

  return prisma.queue.delete({ where: { id: queueId } });
}

export async function listQueues(tenantId: string) {
  const queues = await prisma.queue.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { tickets: true } },
      userQueues: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      whatsappQueues: {
        include: { whatsappSession: { select: { id: true, phoneNumber: true, status: true } } },
      },
    },
  });

  return queues.map((q) => ({
    id: q.id,
    name: q.name,
    color: q.color,
    greetingMessage: q.greetingMessage,
    ticketCount: q._count.tickets,
    users: q.userQueues.map((uq) => uq.user),
    whatsapps: q.whatsappQueues.map((wq) => wq.whatsappSession),
  }));
}

export async function addUserToQueue(userId: string, queueId: string) {
  return prisma.userQueue.upsert({
    where: { userId_queueId: { userId, queueId } },
    update: {},
    create: { userId, queueId },
  });
}

export async function removeUserFromQueue(userId: string, queueId: string) {
  return prisma.userQueue.delete({
    where: { userId_queueId: { userId, queueId } },
  }).catch(() => null);
}

export async function addWhatsappToQueue(whatsappSessionId: string, queueId: string) {
  return prisma.whatsappQueue.upsert({
    where: { whatsappSessionId_queueId: { whatsappSessionId, queueId } },
    update: {},
    create: { whatsappSessionId, queueId },
  });
}

export async function removeWhatsappFromQueue(whatsappSessionId: string, queueId: string) {
  return prisma.whatsappQueue.delete({
    where: { whatsappSessionId_queueId: { whatsappSessionId, queueId } },
  }).catch(() => null);
}

export async function getQueueForWhatsapp(tenantId: string, whatsappSessionId: string) {
  const wq = await prisma.whatsappQueue.findFirst({
    where: { whatsappSessionId },
    include: { queue: true },
  });
  return wq?.queue || null;
}

import prisma from '../lib/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors.js';

export async function rateTicket(ticketId: string, tenantId: string, score: number, comment?: string) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
  if (!ticket) throw new NotFoundError('Ticket', ticketId);
  if (ticket.status !== 'CLOSED') throw new ValidationError('Apenas tickets fechados podem ser avaliados');

  const existing = await prisma.ticketRating.findUnique({ where: { ticketId } });
  if (existing) throw new ConflictError('Ticket já foi avaliado');

  return prisma.ticketRating.create({
    data: { ticketId, score, comment },
  });
}

export async function getRating(ticketId: string, tenantId: string) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
  if (!ticket) throw new NotFoundError('Ticket', ticketId);
  return prisma.ticketRating.findUnique({ where: { ticketId } });
}

export async function getRatingsSummary(tenantId: string) {
  const ratings = await prisma.ticketRating.findMany({
    where: { ticket: { tenantId } },
    select: { score: true },
  });
  const total = ratings.length;
  const avg = total > 0 ? ratings.reduce((s, r) => s + r.score, 0) / total : 0;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratings.forEach(r => { distribution[r.score] = (distribution[r.score] || 0) + 1; });
  return { total, average: Math.round(avg * 10) / 10, distribution };
}

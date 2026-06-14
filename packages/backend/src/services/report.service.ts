import { Readable } from 'stream';
import { Parser } from 'json2csv';
import prisma from '../lib/prisma.js';

export async function getReportData(tenantId: string, startDate?: Date, endDate?: Date, page = 1, limit = 100) {
  const dateFilter: any = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.gte = startDate;
    if (endDate) dateFilter.createdAt.lte = endDate;
  }

  const offset = limit * (page - 1);

  const [tickets, conversations, ratings, ticketCount, conversationCount, ratingCount] = await Promise.all([
    prisma.ticket.findMany({
      where: { tenantId, ...dateFilter },
      select: {
        id: true,
        status: true,
        createdAt: true,
        closedAt: true,
        unreadMessages: true,
        contact: { select: { name: true, phone: true } },
        assignee: { select: { name: true } },
        rating: { select: { score: true, comment: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.conversation.findMany({
      where: { tenantId, ...dateFilter },
      select: {
        id: true,
        channel: true,
        status: true,
        contactName: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.ticketRating.findMany({
      where: { ticket: { tenantId }, ...dateFilter },
      select: { score: true, comment: true, createdAt: true, ticketId: true },
      take: limit,
      skip: offset,
    }),
    prisma.ticket.count({ where: { tenantId, ...dateFilter } }),
    prisma.conversation.count({ where: { tenantId, ...dateFilter } }),
    prisma.ticketRating.count({ where: { ticket: { tenantId }, ...dateFilter } }),
  ]);

  return { tickets, conversations, ratings, pagination: { page, limit, ticketCount, conversationCount, ratingCount } };
}

const CSV_PAGE_SIZE = 500;

/**
 * Stream CSV export using cursor-based pagination.
 * Yields chunks of CSV text — the route pipes the Readable into the response.
 */
export function streamCSV(
  tenantId: string,
  type: 'tickets' | 'conversations' | 'ratings',
  startDate?: Date,
  endDate?: Date
): Readable {
  const dateFilter: any = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.gte = startDate;
    if (endDate) dateFilter.createdAt.lte = endDate;
  }

  let headerSent = false;
  let cursor: string | undefined = undefined;
  let done = false;

  return new Readable({
    async read() {
      if (done) {
        this.push(null);
        return;
      }

      try {
        const rows = await fetchPage(type, tenantId, dateFilter, cursor);
        if (rows.length === 0) {
          if (!headerSent) {
            // empty result — send header only
            const fields = getFields(type);
            this.push(fields.join(',') + '\n');
          }
          done = true;
          this.push(null);
          return;
        }

        const mapped = rows.map(r => mapRow(type, r));
        const fields = getFields(type);

        const parser = new Parser({ fields, header: !headerSent });
        headerSent = true;

        const chunk = parser.parse(mapped);
        this.push(chunk + '\n');

        // Set cursor to last item's ID for next page
        const lastRow = rows[rows.length - 1];
        cursor = lastRow.id;
      } catch (err: any) {
        this.destroy(err);
      }
    },
  });
}

function getFields(type: string): string[] {
  if (type === 'tickets') {
    return ['id', 'contato', 'telefone', 'status', 'atendente', 'mensagens_nao_lidas', 'data_criacao', 'data_fechamento', 'avaliacao', 'comentario_avaliacao'];
  } else if (type === 'conversations') {
    return ['id', 'canal', 'contato', 'status', 'total_mensagens', 'data_criacao', 'data_atualizacao'];
  } else {
    return ['ticket_id', 'nota', 'comentario', 'data'];
  }
}

async function fetchPage(type: string, tenantId: string, dateFilter: any, cursor?: string): Promise<any[]> {
  const where: any = { tenantId, ...dateFilter };
  const ratingWhere: any = { ticket: { tenantId }, ...dateFilter };

  if (cursor) {
    // Use cursor-based pagination: find items created after the last one
    // We compare by createdAt + id to get stable pagination
    const lastItem = type === 'tickets'
      ? await prisma.ticket.findUnique({ where: { id: cursor }, select: { createdAt: true } })
      : type === 'conversations'
        ? await prisma.conversation.findUnique({ where: { id: cursor }, select: { createdAt: true } })
        : null;

    if (lastItem) {
      const cursorFilter = {
        OR: [
          { createdAt: { lt: lastItem.createdAt } },
          { createdAt: lastItem.createdAt, id: { lt: cursor } },
        ],
      };
      if (type === 'ratings') {
        ratingWhere.AND = ratingWhere.AND ? [...(Array.isArray(ratingWhere.AND) ? ratingWhere.AND : [ratingWhere.AND]), cursorFilter] : [cursorFilter];
      } else {
        where.AND = where.AND ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), cursorFilter] : [cursorFilter];
      }
    }
  }

  if (type === 'tickets') {
    return prisma.ticket.findMany({
      where,
      select: {
        id: true, status: true, createdAt: true, closedAt: true, unreadMessages: true,
        contact: { select: { name: true, phone: true } },
        assignee: { select: { name: true } },
        rating: { select: { score: true, comment: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CSV_PAGE_SIZE,
    });
  } else if (type === 'conversations') {
    return prisma.conversation.findMany({
      where,
      select: {
        id: true, channel: true, status: true, contactName: true, createdAt: true, updatedAt: true,
        _count: { select: { messages: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CSV_PAGE_SIZE,
    });
  } else {
    return prisma.ticketRating.findMany({
      where: ratingWhere,
      select: { id: true, ticketId: true, score: true, comment: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CSV_PAGE_SIZE,
    });
  }
}

function mapRow(type: string, row: any): any {
  if (type === 'tickets') {
    return {
      id: row.id,
      contato: row.contact?.name || '',
      telefone: row.contact?.phone || '',
      status: row.status,
      atendente: row.assignee?.name || '',
      mensagens_nao_lidas: row.unreadMessages,
      data_criacao: row.createdAt.toISOString(),
      data_fechamento: row.closedAt?.toISOString() || '',
      avaliacao: row.rating?.score || '',
      comentario_avaliacao: row.rating?.comment || '',
    };
  } else if (type === 'conversations') {
    return {
      id: row.id,
      canal: row.channel,
      contato: row.contactName,
      status: row.status,
      total_mensagens: row._count?.messages || 0,
      data_criacao: row.createdAt.toISOString(),
      data_atualizacao: row.updatedAt.toISOString(),
    };
  } else {
    return {
      ticket_id: row.ticketId,
      nota: row.score,
      comentario: row.comment || '',
      data: row.createdAt.toISOString(),
    };
  }
}

// Keep legacy exportCSV for backward compat (small datasets only)
export async function exportCSV(tenantId: string, type: 'tickets' | 'conversations' | 'ratings', startDate?: Date, endDate?: Date) {
  const data = await getReportData(tenantId, startDate, endDate);

  let rows: any[] = [];
  let fields: string[] = [];

  if (type === 'tickets') {
    fields = getFields('tickets');
    rows = data.tickets.map(t => mapRow('tickets', t));
  } else if (type === 'conversations') {
    fields = getFields('conversations');
    rows = data.conversations.map(c => mapRow('conversations', c));
  } else {
    fields = getFields('ratings');
    rows = data.ratings.map(r => mapRow('ratings', { ...r, id: r.ticketId }));
  }

  const parser = new Parser({ fields });
  return parser.parse(rows);
}

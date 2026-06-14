export interface Ticket {
  id: string;
  tenantId: string;
  conversationId: string;
  contactId: string;
  queueId?: string;
  whatsappSessionId?: string;
  assignedTo?: string;
  status: 'PENDING' | 'OPEN' | 'CLOSED';
  unreadMessages: number;
  lastMessage?: string;
  isGroup: boolean;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketStats {
  pending: number;
  open: number;
  closed: number;
}

export interface TicketRating {
  id: string;
  ticketId: string;
  score: number;
  comment?: string;
  createdAt: Date;
}

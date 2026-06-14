export interface Tag {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketTag {
  id: string;
  ticketId: string;
  tagId: string;
}

export interface Conversation {
  id: string;
  tenantId: string;
  agentId: string;
  channel: 'WHATSAPP' | 'WEB' | 'TELEGRAM' | 'INSTAGRAM';
  contactId?: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  status: 'ACTIVE' | 'PENDING' | 'RESOLVED' | 'HUMAN_TAKEOVER' | 'CLOSED';
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  metadata?: Record<string, unknown>;
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';
  createdAt: Date;
}

export interface ConversationStats {
  active: number;
  pending: number;
  resolved: number;
  takeover: number;
  total: number;
}

export interface DailyStats {
  date: string;
  conversations: number;
  tickets: number;
  resolved: number;
}

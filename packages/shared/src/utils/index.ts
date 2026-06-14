export function formatPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const TICKET_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  OPEN: 'Em Atendimento',
  CLOSED: 'Fechado',
};

export const CONVERSATION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  PENDING: 'Pendente',
  RESOLVED: 'Resolvida',
  HUMAN_TAKEOVER: 'Takeover Humano',
  CLOSED: 'Fechada',
};

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  SUPERVISOR: 'Supervisor',
  OPERATOR: 'Operador',
};

export const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  WEB: 'Web',
  TELEGRAM: 'Telegram',
  INSTAGRAM: 'Instagram',
};

export const WEBHOOK_EVENTS = [
  'ticket.created',
  'ticket.closed',
  'ticket.assigned',
  'message.received',
  'message.sent',
  'conversation.created',
  'conversation.resolved',
  'conversation.human_takeover',
] as const;

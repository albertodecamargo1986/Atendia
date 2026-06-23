"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEBHOOK_EVENTS = exports.CHANNEL_LABELS = exports.ROLE_LABELS = exports.CONVERSATION_STATUS_LABELS = exports.TICKET_STATUS_LABELS = void 0;
exports.formatPhone = formatPhone;
exports.truncate = truncate;
exports.sleep = sleep;
exports.daysAgo = daysAgo;
function formatPhone(phone) {
    return phone.replace(/\D/g, '');
}
function truncate(str, maxLen) {
    return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
}
exports.TICKET_STATUS_LABELS = {
    PENDING: 'Pendente',
    OPEN: 'Em Atendimento',
    CLOSED: 'Fechado',
};
exports.CONVERSATION_STATUS_LABELS = {
    ACTIVE: 'Ativa',
    PENDING: 'Pendente',
    RESOLVED: 'Resolvida',
    HUMAN_TAKEOVER: 'Takeover Humano',
    CLOSED: 'Fechada',
};
exports.ROLE_LABELS = {
    OWNER: 'Owner',
    ADMIN: 'Admin',
    SUPERVISOR: 'Supervisor',
    OPERATOR: 'Operador',
};
exports.CHANNEL_LABELS = {
    WHATSAPP: 'WhatsApp',
    WEB: 'Web',
    TELEGRAM: 'Telegram',
    INSTAGRAM: 'Instagram',
};
exports.WEBHOOK_EVENTS = [
    'ticket.created',
    'ticket.closed',
    'ticket.assigned',
    'message.received',
    'message.sent',
    'conversation.created',
    'conversation.resolved',
    'conversation.human_takeover',
];
//# sourceMappingURL=index.js.map
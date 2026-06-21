"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
exports.getIO = getIO;
const jwt_js_1 = require("./jwt.js");
const prisma_js_1 = __importDefault(require("./prisma.js"));
let io = null;
function initSocket(ioInstance) {
    io = ioInstance;
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            next(new Error('Token nao fornecido'));
            return;
        }
        try {
            const payload = (0, jwt_js_1.verifyAccessToken)(token);
            socket.data.user = payload;
            next();
        }
        catch {
            next(new Error('Token invalido'));
        }
    });
    io.on('connection', (socket) => {
        const user = socket.data.user;
        socket.join(`tenant:${user.tenantId}`);
        socket.join(`user:${user.sub}`);
        // Conversation rooms — validate tenant ownership
        socket.on('conversation:join', async (conversationId) => {
            try {
                const conv = await prisma_js_1.default.conversation.findFirst({
                    where: { id: conversationId, tenantId: user.tenantId },
                    select: { id: true },
                });
                if (conv) {
                    socket.join(`conversation:${conversationId}`);
                }
                else {
                    socket.emit('error', { message: 'Conversation not found or access denied' });
                }
            }
            catch {
                socket.emit('error', { message: 'Failed to join conversation' });
            }
        });
        socket.on('conversation:leave', (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
        });
        // WhatsApp rooms — already scoped to tenant
        socket.on('whatsapp:subscribe', () => {
            socket.join(`whatsapp:${user.tenantId}`);
        });
        // Ticket rooms — validate tenant ownership
        socket.on('ticket:subscribe', async (ticketId) => {
            try {
                const ticket = await prisma_js_1.default.ticket.findFirst({
                    where: { id: ticketId, tenantId: user.tenantId },
                    select: { id: true },
                });
                if (ticket) {
                    socket.join(`ticket:${ticketId}`);
                }
                else {
                    socket.emit('error', { message: 'Ticket not found or access denied' });
                }
            }
            catch {
                socket.emit('error', { message: 'Failed to subscribe to ticket' });
            }
        });
        socket.on('ticket:unsubscribe', (ticketId) => {
            socket.leave(`ticket:${ticketId}`);
        });
        // Subscribe to a ticket status room (PENDING, OPEN, CLOSED) — tenant-scoped
        socket.on('ticket:subscribe-status', (status) => {
            if (['PENDING', 'OPEN', 'CLOSED'].includes(status)) {
                socket.join(`ticket-status:${user.tenantId}:${status}`);
            }
        });
        socket.on('ticket:unsubscribe-status', (status) => {
            socket.leave(`ticket-status:${user.tenantId}:${status}`);
        });
        socket.on('disconnect', () => {
            // client disconnected
        });
    });
}
function getIO() {
    if (!io)
        throw new Error('Socket.io not initialized');
    return io;
}
//# sourceMappingURL=socket.js.map
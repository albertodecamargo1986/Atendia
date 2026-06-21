"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSessions = listSessions;
exports.getSession = getSession;
exports.connectSession = connectSession;
exports.sendWhatsAppMessage = sendWhatsAppMessage;
exports.sendWhatsAppAudio = sendWhatsAppAudio;
exports.reconnectSession = reconnectSession;
exports.disconnectSession = disconnectSession;
exports.getSessionStatus = getSessionStatus;
exports.deleteSession = deleteSession;
exports.reconnectAllSessions = reconnectAllSessions;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const socket_js_1 = require("../lib/socket.js");
const zod_1 = require("zod");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const pino_1 = __importDefault(require("pino"));
const queues_js_1 = require("../workers/queues.js");
const business_hours_service_js_1 = require("./business-hours.service.js");
const queues_js_2 = require("../workers/queues.js");
const contact_service_js_1 = require("./contact.service.js");
const ticket_service_js_1 = require("./ticket.service.js");
const queue_service_js_1 = require("./queue.service.js");
const voice_service_js_1 = require("./voice.service.js");
const connectSchema = zod_1.z.object({
    sessionId: zod_1.z.string().optional(),
});
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || './whatsapp-auth';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const SESSION_ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY;
if (!SESSION_ENCRYPTION_KEY || SESSION_ENCRYPTION_KEY.length < 32) {
    throw new Error('SESSION_ENCRYPTION_KEY is required and must be at least 32 characters. Set a strong key in your .env file.');
}
const activeSockets = new Map();
const baileysLogger = (0, pino_1.default)({ level: 'silent' });
const reconnectAttempts = new Map();
const MAX_RECONNECT_ATTEMPTS = 10;
async function listSessions(tenantId) {
    return prisma_js_1.default.whatsAppSession.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
    });
}
async function getSession(tenantId, sessionId) {
    const session = await prisma_js_1.default.whatsAppSession.findFirst({
        where: { id: sessionId, tenantId },
    });
    if (!session)
        throw new errors_js_1.NotFoundError('Sessão WhatsApp', sessionId);
    return session;
}
async function connectSession(tenantId, data) {
    const tenant = await prisma_js_1.default.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant)
        throw new errors_js_1.NotFoundError('Empresa', tenantId);
    const sessionCount = await prisma_js_1.default.whatsAppSession.count({ where: { tenantId } });
    if (sessionCount >= tenant.maxWhatsapp) {
        throw new errors_js_1.LicenseError(`Limite de sessões WhatsApp atingido (${tenant.maxWhatsapp})`);
    }
    const sessionId = data?.sessionId || `wa_${tenantId}_${Date.now()}`;
    const authDir = path_1.default.join(AUTH_DIR, sessionId);
    await promises_1.default.mkdir(authDir, { recursive: true });
    const session = await prisma_js_1.default.whatsAppSession.create({
        data: {
            tenantId,
            sessionId,
            phoneNumber: '',
            status: 'CONNECTING',
        },
    });
    startBaileysSession(tenantId, session.id, sessionId, authDir);
    return session;
}
async function startBaileysSession(tenantId, dbSessionId, sessionId, authDir) {
    try {
        const { version } = await (0, baileys_1.fetchLatestBaileysVersion)();
        const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(authDir);
        const sock = (0, baileys_1.default)({
            version,
            auth: {
                creds: state.creds,
                keys: (0, baileys_1.makeCacheableSignalKeyStore)(state.keys, baileysLogger),
            },
            printQRInTerminal: false,
            logger: baileysLogger,
            browser: ['AtendIA', 'Chrome', '1.0.0'],
        });
        activeSockets.set(sessionId, sock);
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                const io = (0, socket_js_1.getIO)();
                io.to(`tenant:${tenantId}`).emit('whatsapp:qr', {
                    sessionId: dbSessionId,
                    baileysSessionId: sessionId,
                    qr,
                });
            }
            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = code !== baileys_1.DisconnectReason.loggedOut;
                await prisma_js_1.default.whatsAppSession.update({
                    where: { id: dbSessionId },
                    data: {
                        status: shouldReconnect ? 'DISCONNECTED' : 'BANNED',
                    },
                });
                activeSockets.delete(sessionId);
                const io = (0, socket_js_1.getIO)();
                io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
                    sessionId: dbSessionId,
                    status: shouldReconnect ? 'DISCONNECTED' : 'BANNED',
                });
                if (shouldReconnect) {
                    const attempts = (reconnectAttempts.get(sessionId) || 0) + 1;
                    if (attempts <= MAX_RECONNECT_ATTEMPTS) {
                        reconnectAttempts.set(sessionId, attempts);
                        const delay = Math.min(5000 * Math.pow(2, attempts - 1), 300000);
                        setTimeout(() => {
                            startBaileysSession(tenantId, dbSessionId, sessionId, authDir);
                        }, delay);
                    }
                    else {
                        reconnectAttempts.delete(sessionId);
                        console.warn(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${sessionId}`);
                    }
                }
            }
            else if (connection === 'open') {
                reconnectAttempts.delete(sessionId);
                const phoneNumber = sock.user?.id?.split(':')[0] || '';
                await prisma_js_1.default.whatsAppSession.update({
                    where: { id: dbSessionId },
                    data: {
                        status: 'CONNECTED',
                        phoneNumber,
                        lastConnectedAt: new Date(),
                    },
                });
                const io = (0, socket_js_1.getIO)();
                io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
                    sessionId: dbSessionId,
                    status: 'CONNECTED',
                    phoneNumber,
                });
            }
        });
        sock.ev.on('messages.upsert', async (m) => {
            if (m.type !== 'notify')
                return;
            for (const msg of m.messages) {
                if (!msg.key.fromMe && msg.key.remoteJid) {
                    await handleIncomingMessage(tenantId, sessionId, dbSessionId, sock, msg);
                }
            }
        });
    }
    catch (err) {
        console.error(`Failed to start Baileys session ${sessionId}:`, err.message);
        await prisma_js_1.default.whatsAppSession.update({
            where: { id: dbSessionId },
            data: { status: 'DISCONNECTED' },
        }).catch(() => { });
        const io = (0, socket_js_1.getIO)();
        io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
            sessionId: dbSessionId,
            status: 'DISCONNECTED',
            error: err.message,
        });
    }
}
async function handleIncomingMessage(tenantId, sessionId, dbSessionId, sock, msg) {
    try {
        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast')
            return;
        const content = extractMessageText(msg);
        const isAudioMessage = !!msg.message?.audioMessage;
        if (!content && !isAudioMessage)
            return;
        const contactPhone = jid.split('@')[0];
        const contactName = msg.pushName || contactPhone;
        const isGroup = jid.endsWith('@g.us');
        // Find or create Contact
        const contact = await (0, contact_service_js_1.findOrCreateContact)(tenantId, contactPhone, contactName, undefined, isGroup);
        // Find or create Conversation
        let conversation = await prisma_js_1.default.conversation.findFirst({
            where: {
                tenantId,
                contactPhone,
                status: { in: ['ACTIVE', 'PENDING', 'HUMAN_TAKEOVER'] },
            },
            include: { agent: true },
        });
        if (!conversation) {
            const agent = await prisma_js_1.default.agent.findFirst({
                where: { tenantId, isActive: true },
            });
            if (!agent)
                return;
            conversation = await prisma_js_1.default.conversation.create({
                data: {
                    tenantId,
                    agentId: agent.id,
                    channel: 'WHATSAPP',
                    contactName,
                    contactPhone,
                    contactId: contact.id,
                    status: 'ACTIVE',
                },
                include: { agent: true },
            });
        }
        else if (!conversation.contactId) {
            await prisma_js_1.default.conversation.update({
                where: { id: conversation.id },
                data: { contactId: contact.id },
            });
        }
        // Transcribe audio if applicable
        let messageContent = content || '';
        let audioMetadata = {};
        if (isAudioMessage && sock) {
            try {
                const audioResult = await (0, voice_service_js_1.downloadWhatsAppAudio)(sock, msg);
                if (audioResult) {
                    const transcription = await (0, voice_service_js_1.transcribeAudio)(audioResult.filePath, tenantId);
                    messageContent = transcription ? `[Audio] ${transcription}` : '[Audio]';
                    audioMetadata = { audioTranscribed: !!transcription, audioUrl: `/uploads/audio/${audioResult.fileName}` };
                }
            }
            catch (err) {
                console.error('Audio transcription failed:', err.message);
                messageContent = '[Audio]';
            }
        }
        // Create user message
        const message = await prisma_js_1.default.message.create({
            data: {
                conversationId: conversation.id,
                role: 'USER',
                content: messageContent,
                metadata: { jid, sessionId, messageId: msg.key.id, ...audioMetadata },
                mediaType: isAudioMessage ? 'AUDIO' : undefined,
            },
        });
        // Find or create Ticket
        const queue = await (0, queue_service_js_1.getQueueForWhatsapp)(tenantId, dbSessionId);
        const ticket = await (0, ticket_service_js_1.findOrCreateTicket)(tenantId, contact.id, conversation.id, dbSessionId, 1, messageContent, isGroup);
        // If ticket has a queue but no queueId yet, assign it
        if (ticket && queue && !ticket.queueId) {
            await prisma_js_1.default.ticket.update({
                where: { id: ticket.id },
                data: { queueId: queue.id },
            });
        }
        // Emit real-time events
        const io = (0, socket_js_1.getIO)();
        io.to(`tenant:${tenantId}`).emit('message:new', { conversationId: conversation.id, message });
        io.to(`conversation:${conversation.id}`).emit('message:new', { conversationId: conversation.id, message });
        if (ticket)
            io.to(`ticket:${ticket.id}`).emit('message:new', { conversationId: conversation.id, message });
        // Send greeting message if this is a new ticket with a queue greeting
        if (queue?.greetingMessage && ticket?.status === 'PENDING') {
            try {
                await sock.sendMessage(jid, { text: queue.greetingMessage });
            }
            catch { }
        }
        // Route to AI if appropriate
        if (conversation.status === 'ACTIVE' && conversation.agent.isActive) {
            const withinHours = await (0, business_hours_service_js_1.isWithinBusinessHours)(tenantId);
            if (!withinHours) {
                await queues_js_2.offhoursMessageQueue.add('offhours', {
                    tenantId,
                    conversationId: conversation.id,
                    agentName: conversation.agent.name,
                });
                return;
            }
            const recentMessages = (await prisma_js_1.default.message.findMany({
                where: { conversationId: conversation.id },
                orderBy: { createdAt: 'asc' },
                take: 20,
            })).map((m) => ({ role: m.role.toLowerCase(), content: m.content }));
            await queues_js_1.aiResponseQueue.add('generate', {
                agentId: conversation.agentId,
                tenantId,
                conversationId: conversation.id,
                messages: recentMessages,
            });
        }
    }
    catch (err) {
        console.error('Error handling incoming WhatsApp message:', err.message);
    }
}
function extractMessageText(msg) {
    const text = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.documentMessage?.caption;
    if (text)
        return text;
    if (msg.message?.imageMessage)
        return '[Imagem]';
    if (msg.message?.videoMessage)
        return '[Video]';
    if (msg.message?.audioMessage)
        return '[Audio]';
    if (msg.message?.documentMessage)
        return `[Documento: ${msg.message.documentMessage.fileName}]`;
    if (msg.message?.stickerMessage)
        return '[Sticker]';
    if (msg.message?.contactMessage)
        return `[Contato: ${msg.message.contactMessage.displayName}]`;
    if (msg.message?.locationMessage)
        return '[Localizacao]';
    return null;
}
async function sendWhatsAppMessage(sessionId, jid, content) {
    const sock = activeSockets.get(sessionId);
    if (!sock)
        throw new errors_js_1.NotFoundError('Sessão WhatsApp', sessionId);
    const sent = await sock.sendMessage(jid, { text: content });
    return sent;
}
async function sendWhatsAppAudio(sessionId, jid, audioPath) {
    const sock = activeSockets.get(sessionId);
    if (!sock)
        throw new errors_js_1.NotFoundError('Sessão WhatsApp', sessionId);
    const uploadsDir = path_1.default.resolve(UPLOAD_DIR);
    const absolutePath = path_1.default.resolve(audioPath);
    if (!absolutePath.startsWith(uploadsDir)) {
        throw new errors_js_1.ForbiddenError('Caminho de áudio inválido');
    }
    const sent = await sock.sendMessage(jid, {
        audio: { url: absolutePath },
        mimetype: 'audio/mp3',
        ptt: true,
    });
    return sent;
}
async function reconnectSession(tenantId, sessionId) {
    const session = await prisma_js_1.default.whatsAppSession.findFirst({
        where: { id: sessionId, tenantId },
    });
    if (!session)
        throw new errors_js_1.NotFoundError('Sessão WhatsApp', sessionId);
    const authDir = path_1.default.join(AUTH_DIR, session.sessionId);
    await prisma_js_1.default.whatsAppSession.update({
        where: { id: sessionId },
        data: { status: 'CONNECTING' },
    });
    startBaileysSession(tenantId, sessionId, session.sessionId, authDir);
    const io = (0, socket_js_1.getIO)();
    io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
        sessionId,
        status: 'CONNECTING',
    });
    return prisma_js_1.default.whatsAppSession.findFirst({ where: { id: sessionId } });
}
async function disconnectSession(tenantId, sessionId) {
    const session = await prisma_js_1.default.whatsAppSession.findFirst({
        where: { id: sessionId, tenantId },
    });
    if (!session)
        throw new errors_js_1.NotFoundError('Sessão WhatsApp', sessionId);
    const sock = activeSockets.get(session.sessionId);
    if (sock) {
        sock.end(undefined);
        activeSockets.delete(session.sessionId);
    }
    const updated = await prisma_js_1.default.whatsAppSession.update({
        where: { id: sessionId },
        data: { status: 'DISCONNECTED' },
    });
    const io = (0, socket_js_1.getIO)();
    io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
        sessionId: session.id,
        status: 'DISCONNECTED',
    });
    return updated;
}
async function getSessionStatus(tenantId, sessionId) {
    const session = await prisma_js_1.default.whatsAppSession.findFirst({
        where: { id: sessionId, tenantId },
    });
    if (!session)
        throw new errors_js_1.NotFoundError('Sessão', sessionId);
    return session;
}
async function deleteSession(tenantId, sessionId) {
    const session = await prisma_js_1.default.whatsAppSession.findFirst({
        where: { id: sessionId, tenantId },
    });
    if (!session)
        throw new errors_js_1.NotFoundError('Sessão WhatsApp', sessionId);
    const sock = activeSockets.get(session.sessionId);
    if (sock) {
        sock.end(undefined);
        activeSockets.delete(session.sessionId);
    }
    const authDir = path_1.default.join(AUTH_DIR, session.sessionId);
    try {
        await promises_1.default.access(authDir);
        await promises_1.default.rm(authDir, { recursive: true, force: true });
    }
    catch { }
    await prisma_js_1.default.whatsAppSession.delete({ where: { id: sessionId } });
    const io = (0, socket_js_1.getIO)();
    io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
        sessionId: session.id,
        status: 'DELETED',
    });
}
async function reconnectAllSessions() {
    const sessions = await prisma_js_1.default.whatsAppSession.findMany({
        where: { status: 'CONNECTED' },
    });
    for (const session of sessions) {
        const authDir = path_1.default.join(AUTH_DIR, session.sessionId);
        try {
            await promises_1.default.access(authDir);
            startBaileysSession(session.tenantId, session.id, session.sessionId, authDir);
        }
        catch { }
    }
    return sessions.length;
}
//# sourceMappingURL=whatsapp.service.js.map
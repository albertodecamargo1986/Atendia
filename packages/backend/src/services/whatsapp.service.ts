import prisma from '../lib/prisma.js';
import { NotFoundError, LicenseError, ForbiddenError } from '../lib/errors.js';
import { getIO } from '../lib/socket.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type BaileysEventMap,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import QRCode from 'qrcode';
import { aiResponseQueue } from '../workers/queues.js';
import { isWithinBusinessHours } from './business-hours.service.js';
import { offhoursMessageQueue } from '../workers/queues.js';
import { findOrCreateContact } from './contact.service.js';
import { findOrCreateTicket, markAsRead } from './ticket.service.js';
import { getQueueForWhatsapp } from './queue.service.js';
import { whatsappOutboundQueue } from '../workers/queues.js';
import { downloadWhatsAppAudio, transcribeAudio } from './voice.service.js';

const connectSchema = z.object({
  sessionId: z.string().optional(),
});

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || './whatsapp-auth';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const SESSION_ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY;
if (!SESSION_ENCRYPTION_KEY || SESSION_ENCRYPTION_KEY.length < 32) {
  throw new Error('SESSION_ENCRYPTION_KEY is required and must be at least 32 characters. Set a strong key in your .env file.');
}

const activeSockets = new Map<string, WASocket>();
const baileysLogger = P({ level: 'silent' });
const reconnectAttempts = new Map<string, number>();
const MAX_RECONNECT_ATTEMPTS = 10;

export async function listSessions(tenantId: string) {
  return prisma.whatsAppSession.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSession(tenantId: string, sessionId: string) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) throw new NotFoundError('Sessão WhatsApp', sessionId);
  return session;
}

export async function connectSession(tenantId: string, data?: z.infer<typeof connectSchema>) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Empresa', tenantId);

  const sessionCount = await prisma.whatsAppSession.count({ where: { tenantId } });
  if (sessionCount >= tenant.maxWhatsapp) {
    throw new LicenseError(`Limite de sessões WhatsApp atingido (${tenant.maxWhatsapp})`);
  }

  const sessionId = data?.sessionId || `wa_${tenantId}_${Date.now()}`;
  const authDir = path.join(AUTH_DIR, sessionId);
  await fs.mkdir(authDir, { recursive: true });

  const session = await prisma.whatsAppSession.create({
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

async function startBaileysSession(
  tenantId: string,
  dbSessionId: string,
  sessionId: string,
  authDir: string
) {
  try {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
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
        const io = getIO();
        io.to(`tenant:${tenantId}`).emit('whatsapp:qr', {
          sessionId: dbSessionId,
          baileysSessionId: sessionId,
          qr,
        });
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;

        await prisma.whatsAppSession.update({
          where: { id: dbSessionId },
          data: {
            status: shouldReconnect ? 'DISCONNECTED' : 'BANNED',
          },
        });

        activeSockets.delete(sessionId);

        const io = getIO();
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
          } else {
            reconnectAttempts.delete(sessionId);
            console.warn(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${sessionId}`);
          }
        }
      } else if (connection === 'open') {
        reconnectAttempts.delete(sessionId);
        const phoneNumber = sock.user?.id?.split(':')[0] || '';
        await prisma.whatsAppSession.update({
          where: { id: dbSessionId },
          data: {
            status: 'CONNECTED',
            phoneNumber,
            lastConnectedAt: new Date(),
          },
        });

        const io = getIO();
        io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
          sessionId: dbSessionId,
          status: 'CONNECTED',
          phoneNumber,
        });
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        if (!msg.key.fromMe && msg.key.remoteJid) {
          await handleIncomingMessage(tenantId, sessionId, dbSessionId, sock, msg);
        }
      }
    });
  } catch (err: any) {
    console.error(`Failed to start Baileys session ${sessionId}:`, err.message);

    await prisma.whatsAppSession.update({
      where: { id: dbSessionId },
      data: { status: 'DISCONNECTED' },
    }).catch(() => {});

    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
      sessionId: dbSessionId,
      status: 'DISCONNECTED',
      error: err.message,
    });
  }
}

async function handleIncomingMessage(
  tenantId: string,
  sessionId: string,
  dbSessionId: string,
  sock: WASocket,
  msg: any
) {
  try {
    const jid = msg.key.remoteJid;
    if (!jid || jid === 'status@broadcast') return;

    const content = extractMessageText(msg);
    const isAudioMessage = !!msg.message?.audioMessage;

    if (!content && !isAudioMessage) return;

    const contactPhone = jid.split('@')[0];
    const contactName = msg.pushName || contactPhone;
    const isGroup = jid.endsWith('@g.us');

    // Find or create Contact
    const contact = await findOrCreateContact(
      tenantId,
      contactPhone,
      contactName,
      undefined,
      isGroup
    );

    // Find or create Conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        tenantId,
        contactPhone,
        status: { in: ['ACTIVE', 'PENDING', 'HUMAN_TAKEOVER'] },
      },
      include: { agent: true },
    });

    if (!conversation) {
      const agent = await prisma.agent.findFirst({
        where: { tenantId, isActive: true },
      });
      if (!agent) return;

      conversation = await prisma.conversation.create({
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
    } else if (!conversation.contactId) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { contactId: contact.id },
      });
    }

  // Transcribe audio if applicable
  let messageContent = content || '';
  let audioMetadata: Record<string, unknown> = {};

  if (isAudioMessage && sock) {
    try {
      const audioResult = await downloadWhatsAppAudio(sock, msg);
      if (audioResult) {
        const transcription = await transcribeAudio(audioResult.filePath, tenantId);
        messageContent = transcription ? `[Audio] ${transcription}` : '[Audio]';
        audioMetadata = { audioTranscribed: !!transcription, audioUrl: `/uploads/audio/${audioResult.fileName}` };
      }
    } catch (err: any) {
      console.error('Audio transcription failed:', err.message);
      messageContent = '[Audio]';
    }
  }

    // Create user message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: messageContent,
        metadata: { jid, sessionId, messageId: msg.key.id, ...audioMetadata },
      mediaType: isAudioMessage ? 'AUDIO' : undefined,
      },
    });

    // Find or create Ticket
    const queue = await getQueueForWhatsapp(tenantId, dbSessionId);
    const ticket = await findOrCreateTicket(
      tenantId,
      contact.id,
      conversation.id,
      dbSessionId,
      1,
      messageContent,
      isGroup
    );

    // If ticket has a queue but no queueId yet, assign it
    if (ticket && queue && !ticket.queueId) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { queueId: queue.id },
      });
    }

    // Emit real-time events
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('message:new', { conversationId: conversation.id, message });
    io.to(`conversation:${conversation.id}`).emit('message:new', { conversationId: conversation.id, message });
    if (ticket) io.to(`ticket:${ticket.id}`).emit('message:new', { conversationId: conversation.id, message });

    // Send greeting message if this is a new ticket with a queue greeting
    if (queue?.greetingMessage && ticket?.status === 'PENDING') {
      try {
        await sock.sendMessage(jid, { text: queue.greetingMessage });
      } catch {}
    }

    // Route to AI if appropriate
    if (conversation.status === 'ACTIVE' && conversation.agent.isActive) {
      const withinHours = await isWithinBusinessHours(tenantId);

      if (!withinHours) {
        await offhoursMessageQueue.add('offhours', {
          tenantId,
          conversationId: conversation.id,
          agentName: conversation.agent.name,
        });
        return;
      }

      const recentMessages = (
        await prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'asc' },
          take: 20,
        })
      ).map((m) => ({ role: m.role.toLowerCase(), content: m.content }));

      await aiResponseQueue.add('generate', {
        agentId: conversation.agentId,
        tenantId,
        conversationId: conversation.id,
        messages: recentMessages,
      });
    }
  } catch (err: any) {
    console.error('Error handling incoming WhatsApp message:', err.message);
  }
}

function extractMessageText(msg: any): string | null {
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    msg.message?.documentMessage?.caption;

  if (text) return text;

  if (msg.message?.imageMessage) return '[Imagem]';
  if (msg.message?.videoMessage) return '[Video]';
  if (msg.message?.audioMessage) return '[Audio]';
  if (msg.message?.documentMessage) return `[Documento: ${msg.message.documentMessage.fileName}]`;
  if (msg.message?.stickerMessage) return '[Sticker]';
  if (msg.message?.contactMessage) return `[Contato: ${msg.message.contactMessage.displayName}]`;
  if (msg.message?.locationMessage) return '[Localizacao]';

  return null;
}

export async function sendWhatsAppMessage(
  sessionId: string,
  jid: string,
  content: string
) {
  const sock = activeSockets.get(sessionId);
  if (!sock) throw new NotFoundError('Sessão WhatsApp', sessionId);

  const sent = await sock.sendMessage(jid, { text: content });
  return sent;
}

export async function sendWhatsAppAudio(
  sessionId: string,
  jid: string,
  audioPath: string
) {
  const sock = activeSockets.get(sessionId);
  if (!sock) throw new NotFoundError('Sessão WhatsApp', sessionId);

  const uploadsDir = path.resolve(UPLOAD_DIR);
  const absolutePath = path.resolve(audioPath);
  if (!absolutePath.startsWith(uploadsDir)) {
    throw new ForbiddenError('Caminho de áudio inválido');
  }

  const sent = await sock.sendMessage(jid, {
    audio: { url: absolutePath },
    mimetype: 'audio/mp3',
    ptt: true,
  });
  return sent;
}

export async function reconnectSession(tenantId: string, sessionId: string) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) throw new NotFoundError('Sessão WhatsApp', sessionId);

  const authDir = path.join(AUTH_DIR, session.sessionId);

  await prisma.whatsAppSession.update({
    where: { id: sessionId },
    data: { status: 'CONNECTING' },
  });

  startBaileysSession(tenantId, sessionId, session.sessionId, authDir);

  const io = getIO();
  io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
    sessionId,
    status: 'CONNECTING',
  });

  return prisma.whatsAppSession.findFirst({ where: { id: sessionId } });
}

export async function disconnectSession(tenantId: string, sessionId: string) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) throw new NotFoundError('Sessão WhatsApp', sessionId);

  const sock = activeSockets.get(session.sessionId);
  if (sock) {
    sock.end(undefined);
    activeSockets.delete(session.sessionId);
  }

  const updated = await prisma.whatsAppSession.update({
    where: { id: sessionId },
    data: { status: 'DISCONNECTED' },
  });

  const io = getIO();
  io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
    sessionId: session.id,
    status: 'DISCONNECTED',
  });

  return updated;
}

export async function getSessionStatus(tenantId: string, sessionId: string) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) throw new NotFoundError('Sessão', sessionId);

  return session;
}

export async function deleteSession(tenantId: string, sessionId: string) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) throw new NotFoundError('Sessão WhatsApp', sessionId);

  const sock = activeSockets.get(session.sessionId);
  if (sock) {
    sock.end(undefined);
    activeSockets.delete(session.sessionId);
  }

  const authDir = path.join(AUTH_DIR, session.sessionId);
  try {
    await fs.access(authDir);
    await fs.rm(authDir, { recursive: true, force: true });
  } catch {}

  await prisma.whatsAppSession.delete({ where: { id: sessionId } });

  const io = getIO();
  io.to(`tenant:${tenantId}`).emit('whatsapp:status', {
    sessionId: session.id,
    status: 'DELETED',
  });
}

export async function reconnectAllSessions() {
  const sessions = await prisma.whatsAppSession.findMany({
    where: { status: 'CONNECTED' },
  });

  for (const session of sessions) {
    const authDir = path.join(AUTH_DIR, session.sessionId);
    try {
      await fs.access(authDir);
      startBaileysSession(session.tenantId, session.id, session.sessionId, authDir);
    } catch {}
  }

  return sessions.length;
}

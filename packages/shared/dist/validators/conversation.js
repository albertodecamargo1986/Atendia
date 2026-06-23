"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageSchema = exports.createConversationSchema = void 0;
const zod_1 = require("zod");
exports.createConversationSchema = zod_1.z.object({
    agentId: zod_1.z.string().uuid(),
    channel: zod_1.z.enum(['WHATSAPP', 'WEB', 'TELEGRAM', 'INSTAGRAM']),
    contactName: zod_1.z.string().min(1),
    contactPhone: zod_1.z.string().optional(),
    contactEmail: zod_1.z.string().email().optional(),
});
exports.sendMessageSchema = zod_1.z.object({
    content: zod_1.z.string().min(1, 'Mensagem não pode estar vazia'),
    mediaUrl: zod_1.z.string().optional(),
    mediaType: zod_1.z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT']).optional(),
});
//# sourceMappingURL=conversation.js.map
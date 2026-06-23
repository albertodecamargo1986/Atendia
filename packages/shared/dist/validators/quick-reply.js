"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateQuickReplySchema = exports.createQuickReplySchema = void 0;
const zod_1 = require("zod");
exports.createQuickReplySchema = zod_1.z.object({
    shortcode: zod_1.z.string().min(1, 'Shortcode é obrigatório'),
    content: zod_1.z.string().min(1, 'Conteúdo é obrigatório'),
    category: zod_1.z.string().optional(),
});
exports.updateQuickReplySchema = exports.createQuickReplySchema.partial();
//# sourceMappingURL=quick-reply.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWebhookSchema = exports.createWebhookSchema = void 0;
const zod_1 = require("zod");
exports.createWebhookSchema = zod_1.z.object({
    url: zod_1.z.string().url('URL inválida'),
    events: zod_1.z.array(zod_1.z.string()).min(1, 'Selecione ao menos um evento'),
    secret: zod_1.z.string().min(8, 'Secret deve ter no mínimo 8 caracteres').optional(),
});
exports.updateWebhookSchema = exports.createWebhookSchema.partial();
//# sourceMappingURL=webhook.js.map
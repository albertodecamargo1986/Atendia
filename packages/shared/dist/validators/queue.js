"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateQueueSchema = exports.createQueueSchema = void 0;
const zod_1 = require("zod");
exports.createQueueSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').default('#6366f1'),
    greetingMessage: zod_1.z.string().optional(),
});
exports.updateQueueSchema = exports.createQueueSchema.partial();
//# sourceMappingURL=queue.js.map
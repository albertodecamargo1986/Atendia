"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTagSchema = exports.createTagSchema = void 0;
const zod_1 = require("zod");
exports.createTagSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Nome é obrigatório'),
    color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').default('#6366f1'),
});
exports.updateTagSchema = exports.createTagSchema.partial();
//# sourceMappingURL=tag.js.map
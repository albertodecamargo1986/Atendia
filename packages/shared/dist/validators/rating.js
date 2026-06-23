"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRatingSchema = void 0;
const zod_1 = require("zod");
exports.createRatingSchema = zod_1.z.object({
    score: zod_1.z.number().int().min(1, 'Nota mínima: 1').max(5, 'Nota máxima: 5'),
    comment: zod_1.z.string().max(1000, 'Comentário deve ter no máximo 1000 caracteres').optional(),
});
//# sourceMappingURL=rating.js.map
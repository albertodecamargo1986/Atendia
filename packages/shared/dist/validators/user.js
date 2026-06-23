"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserSchema = exports.createUserSchema = void 0;
const zod_1 = require("zod");
exports.createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    email: zod_1.z.string().email('E-mail inválido'),
    password: zod_1.z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    role: zod_1.z.enum(['OWNER', 'ADMIN', 'SUPERVISOR', 'OPERATOR']).default('OPERATOR'),
});
exports.updateUserSchema = exports.createUserSchema.partial().omit({ password: true });
//# sourceMappingURL=user.js.map
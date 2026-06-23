"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateContactSchema = exports.createContactSchema = void 0;
const zod_1 = require("zod");
exports.createContactSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Nome é obrigatório'),
    phone: zod_1.z.string().min(10, 'Telefone inválido'),
    email: zod_1.z.string().email('Email inválido').optional().or(zod_1.z.literal('')),
    cpfCnpj: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    state: zod_1.z.string().max(2, 'Use sigla do estado (ex: SP)').optional(),
    zipCode: zod_1.z.string().optional(),
    company: zod_1.z.string().optional(),
    role: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
exports.updateContactSchema = exports.createContactSchema.partial();
//# sourceMappingURL=contact.js.map
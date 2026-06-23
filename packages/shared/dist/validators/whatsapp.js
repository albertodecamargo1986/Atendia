"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectWhatsAppSchema = void 0;
const zod_1 = require("zod");
exports.connectWhatsAppSchema = zod_1.z.object({
    phoneNumber: zod_1.z.string().min(10, 'Número de telefone inválido'),
});
//# sourceMappingURL=whatsapp.js.map
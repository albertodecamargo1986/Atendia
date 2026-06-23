"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCampaignSchema = exports.createCampaignSchema = void 0;
const zod_1 = require("zod");
exports.createCampaignSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    message: zod_1.z.string().min(1, 'Mensagem é obrigatória'),
    contactIds: zod_1.z.array(zod_1.z.string().uuid()).min(1, 'Selecione ao menos um contato'),
    scheduledAt: zod_1.z.string().optional(),
});
exports.updateCampaignSchema = exports.createCampaignSchema.partial().omit({ contactIds: true });
//# sourceMappingURL=campaign.js.map
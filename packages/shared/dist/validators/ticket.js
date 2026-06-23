"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateTicketSchema = exports.updateTicketSchema = void 0;
const zod_1 = require("zod");
exports.updateTicketSchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'OPEN', 'CLOSED']).optional(),
    assignedTo: zod_1.z.string().uuid().optional().nullable(),
    queueId: zod_1.z.string().uuid().optional().nullable(),
});
exports.rateTicketSchema = zod_1.z.object({
    score: zod_1.z.number().int().min(1).max(5),
    comment: zod_1.z.string().max(500).optional(),
});
//# sourceMappingURL=ticket.js.map
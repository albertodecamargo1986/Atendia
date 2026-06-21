"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateTicket = rateTicket;
exports.getRating = getRating;
exports.getRatingsSummary = getRatingsSummary;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
async function rateTicket(ticketId, tenantId, score, comment) {
    const ticket = await prisma_js_1.default.ticket.findFirst({ where: { id: ticketId, tenantId } });
    if (!ticket)
        throw new errors_js_1.NotFoundError('Ticket', ticketId);
    if (ticket.status !== 'CLOSED')
        throw new errors_js_1.ValidationError('Apenas tickets fechados podem ser avaliados');
    const existing = await prisma_js_1.default.ticketRating.findUnique({ where: { ticketId } });
    if (existing)
        throw new errors_js_1.ConflictError('Ticket já foi avaliado');
    return prisma_js_1.default.ticketRating.create({
        data: { ticketId, score, comment },
    });
}
async function getRating(ticketId, tenantId) {
    const ticket = await prisma_js_1.default.ticket.findFirst({ where: { id: ticketId, tenantId } });
    if (!ticket)
        throw new errors_js_1.NotFoundError('Ticket', ticketId);
    return prisma_js_1.default.ticketRating.findUnique({ where: { ticketId } });
}
async function getRatingsSummary(tenantId) {
    const ratings = await prisma_js_1.default.ticketRating.findMany({
        where: { ticket: { tenantId } },
        select: { score: true },
    });
    const total = ratings.length;
    const avg = total > 0 ? ratings.reduce((s, r) => s + r.score, 0) / total : 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratings.forEach(r => { distribution[r.score] = (distribution[r.score] || 0) + 1; });
    return { total, average: Math.round(avg * 10) / 10, distribution };
}
//# sourceMappingURL=rating.service.js.map
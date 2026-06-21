"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const feature_gate_js_1 = require("../middlewares/feature-gate.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, feature_gate_js_1.requireModule)('tags'));
const tagSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50),
    color: zod_1.z.string().default('#6366f1'),
});
router.get('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tags = await prisma_js_1.default.tag.findMany({
        where: { tenantId: req.user.tenantId },
        include: { _count: { select: { tickets: true } } },
        orderBy: { name: 'asc' },
    });
    res.json(tags);
}));
router.post('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const data = tagSchema.parse(req.body);
    const tag = await prisma_js_1.default.tag.create({
        data: { ...data, tenantId: req.user.tenantId },
    });
    res.status(201).json(tag);
}));
router.patch('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const data = tagSchema.partial().parse(req.body);
    const tag = await prisma_js_1.default.tag.update({
        where: { id: req.params.id, tenantId: req.user.tenantId },
        data,
    });
    res.json(tag);
}));
router.delete('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await prisma_js_1.default.tag.delete({
        where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    res.json({ ok: true });
}));
// Tag/untag a ticket
router.post('/ticket/:ticketId', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { tagId } = req.body;
    if (!tagId)
        throw new errors_js_1.ValidationError('tagId é obrigatório');
    const ticket = await prisma_js_1.default.ticket.findFirst({
        where: { id: req.params.ticketId, tenantId: req.user.tenantId },
    });
    if (!ticket)
        throw new errors_js_1.NotFoundError('Ticket', req.params.ticketId);
    const link = await prisma_js_1.default.ticketTag.create({
        data: { ticketId: ticket.id, tagId },
    });
    res.status(201).json(link);
}));
router.delete('/ticket/:ticketId/:tagId', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await prisma_js_1.default.ticketTag.delete({
        where: {
            ticketId_tagId: {
                ticketId: req.params.ticketId,
                tagId: req.params.tagId,
            },
        },
    });
    res.json({ ok: true });
}));
exports.default = router;
//# sourceMappingURL=tags.js.map
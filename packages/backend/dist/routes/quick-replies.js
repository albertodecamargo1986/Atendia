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
const zod_1 = require("zod");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, feature_gate_js_1.requireModule)('quickReplies'));
const upsertSchema = zod_1.z.object({
    shortcode: zod_1.z.string().min(1).max(50),
    content: zod_1.z.string().min(1).max(2000),
    category: zod_1.z.string().max(100).optional(),
});
router.get('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const replies = await prisma_js_1.default.quickReply.findMany({
        where: { tenantId: req.user.tenantId },
        orderBy: [{ category: 'asc' }, { shortcode: 'asc' }],
    });
    res.json(replies);
}));
router.post('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const data = upsertSchema.parse(req.body);
    const reply = await prisma_js_1.default.quickReply.create({
        data: { ...data, tenantId: req.user.tenantId },
    });
    res.status(201).json(reply);
}));
router.patch('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const data = upsertSchema.partial().parse(req.body);
    const reply = await prisma_js_1.default.quickReply.update({
        where: { id: req.params.id, tenantId: req.user.tenantId },
        data,
    });
    res.json(reply);
}));
router.delete('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await prisma_js_1.default.quickReply.delete({
        where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    res.json({ ok: true });
}));
exports.default = router;
//# sourceMappingURL=quick-replies.js.map
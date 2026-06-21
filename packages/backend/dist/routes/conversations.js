"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const conversationService = __importStar(require("../services/conversation.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware);
router.post('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const conversation = await conversationService.createConversation(req.user.tenantId, req.body);
    res.status(201).json(conversation);
}));
router.get('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const conversations = await conversationService.listConversations(req.user.tenantId, {
        status: req.query.status,
        agentId: req.query.agentId,
        page: parseInt(req.query.page) || undefined,
    });
    res.json(conversations);
}));
router.get('/stats', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const stats = await conversationService.getConversationStats(req.user.tenantId);
    res.json(stats);
}));
router.get('/stats/daily', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const days = parseInt(req.query.days) || 14;
    const daily = await conversationService.getDailyStats(req.user.tenantId, days);
    res.json(daily);
}));
router.get('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const conversation = await conversationService.getConversation(req.user.tenantId, req.params.id);
    res.json(conversation);
}));
router.post('/:id/messages', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const message = await conversationService.sendMessage(req.user.tenantId, req.params.id, req.body, req.user.sub);
    res.status(201).json(message);
}));
router.post('/:id/escalate', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const conversation = await conversationService.escalateConversation(req.user.tenantId, req.params.id, req.user.sub);
    res.json(conversation);
}));
router.post('/:id/resolve', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const conversation = await conversationService.resolveConversation(req.user.tenantId, req.params.id);
    res.json(conversation);
}));
router.post('/:id/return-to-agent', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const conversation = await conversationService.returnToAgent(req.user.tenantId, req.params.id);
    res.json(conversation);
}));
router.post('/:id/transfer', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { toUserId } = req.body;
    if (!toUserId)
        throw new errors_js_1.ValidationError('toUserId é obrigatório');
    const conversation = await conversationService.transferConversation(req.user.tenantId, req.params.id, toUserId);
    res.json(conversation);
}));
router.post('/:id/note', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { content } = req.body;
    if (!content)
        throw new errors_js_1.ValidationError('Conteúdo da nota é obrigatório');
    const message = await conversationService.addInternalNote(req.user.tenantId, req.params.id, content, req.user.sub);
    res.status(201).json(message);
}));
router.delete('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await conversationService.deleteConversation(req.user.tenantId, req.params.id);
    res.json({ ok: true });
}));
exports.default = router;
//# sourceMappingURL=conversations.js.map
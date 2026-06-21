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
const chatService = __importStar(require("../services/internal-chat.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const feature_gate_js_1 = require("../middlewares/feature-gate.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, feature_gate_js_1.requireModule)('internalChat'));
router.post('/send', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { receiverId, groupId, content } = req.body;
    if (!content || !content.trim())
        throw new errors_js_1.ValidationError('Conteúdo é obrigatório');
    if (!receiverId && !groupId)
        throw new errors_js_1.ValidationError('Informe receiverId ou groupId');
    const result = await chatService.sendMessage(req.user.tenantId, req.user.sub, receiverId || null, groupId || null, content);
    res.status(201).json(result);
}));
router.get('/direct/:userId', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const result = await chatService.getDirectMessages(req.user.tenantId, req.user.sub, req.params.userId, page);
    res.json(result);
}));
router.get('/group/:groupId', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const result = await chatService.getGroupMessages(req.user.tenantId, req.params.groupId, page);
    res.json(result);
}));
router.post('/:messageId/read', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await chatService.markAsRead(req.params.messageId, req.user.tenantId, req.user.sub);
    res.json({ ok: true });
}));
router.get('/unread', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const count = await chatService.getUnreadCount(req.user.sub, req.user.tenantId);
    res.json({ count });
}));
exports.default = router;
//# sourceMappingURL=internal-chat.js.map
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
const whatsappService = __importStar(require("../services/whatsapp.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware);
router.get('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const sessions = await whatsappService.listSessions(req.user.tenantId);
    res.json(sessions);
}));
router.post('/connect', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const session = await whatsappService.connectSession(req.user.tenantId, req.body);
    res.status(201).json(session);
}));
router.get('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const session = await whatsappService.getSessionStatus(req.user.tenantId, req.params.id);
    res.json(session);
}));
router.post('/:id/reconnect', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const session = await whatsappService.reconnectSession(req.user.tenantId, req.params.id);
    res.json(session);
}));
router.post('/:id/disconnect', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const session = await whatsappService.disconnectSession(req.user.tenantId, req.params.id);
    res.json(session);
}));
router.delete('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await whatsappService.deleteSession(req.user.tenantId, req.params.id);
    res.json({ success: true });
}));
exports.default = router;
//# sourceMappingURL=whatsapp.js.map
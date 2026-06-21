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
const queueService = __importStar(require("../services/queue.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const feature_gate_js_1 = require("../middlewares/feature-gate.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, feature_gate_js_1.requireModule)('queues'));
router.get('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const queues = await queueService.listQueues(req.user.tenantId);
    res.json(queues);
}));
router.post('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const queue = await queueService.createQueue(req.user.tenantId, req.body);
    res.status(201).json(queue);
}));
router.patch('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const queue = await queueService.updateQueue(req.user.tenantId, req.params.id, req.body);
    res.json(queue);
}));
router.delete('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const queue = await queueService.deleteQueue(req.user.tenantId, req.params.id);
    res.json(queue);
}));
router.post('/:id/users/:userId', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const result = await queueService.addUserToQueue(req.params.userId, req.params.id);
    res.status(201).json(result);
}));
router.delete('/:id/users/:userId', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await queueService.removeUserFromQueue(req.params.userId, req.params.id);
    res.status(204).end();
}));
router.post('/:id/whatsapp/:sessionId', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const result = await queueService.addWhatsappToQueue(req.params.sessionId, req.params.id);
    res.status(201).json(result);
}));
router.delete('/:id/whatsapp/:sessionId', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await queueService.removeWhatsappFromQueue(req.params.sessionId, req.params.id);
    res.status(204).end();
}));
exports.default = router;
//# sourceMappingURL=queues.js.map
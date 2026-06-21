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
const agentService = __importStar(require("../services/agent.service.js"));
const aiService = __importStar(require("../services/ai.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware);
router.get('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const agents = await agentService.listAgents(req.user.tenantId);
    res.json(agents);
}));
router.get('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const agent = await agentService.getAgent(req.user.tenantId, req.params.id);
    res.json(agent);
}));
router.post('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const agent = await agentService.createAgent(req.user.tenantId, req.body);
    res.status(201).json(agent);
}));
router.put('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const agent = await agentService.updateAgent(req.user.tenantId, req.params.id, req.body);
    res.json(agent);
}));
router.delete('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await agentService.deleteAgent(req.user.tenantId, req.params.id);
    res.json({ message: 'Agente deletado com sucesso' });
}));
router.post('/:id/activate', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const agent = await agentService.activateAgent(req.user.tenantId, req.params.id);
    res.json(agent);
}));
router.post('/:id/deactivate', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const agent = await agentService.deactivateAgent(req.user.tenantId, req.params.id);
    res.json(agent);
}));
router.post('/:id/test', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { message } = req.body;
    if (!message)
        throw new errors_js_1.ValidationError('Mensagem de teste obrigatória');
    const response = await aiService.testAgent(req.params.id, req.user.tenantId, message);
    res.json({ response });
}));
exports.default = router;
//# sourceMappingURL=agents.js.map
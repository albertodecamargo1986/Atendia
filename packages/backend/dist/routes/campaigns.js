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
const campaignService = __importStar(require("../services/campaign.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const feature_gate_js_1 = require("../middlewares/feature-gate.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, feature_gate_js_1.requireModule)('campaigns'));
router.get('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const result = await campaignService.listCampaigns(tenantId);
    res.json({ success: true, data: result });
}));
router.get('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const result = await campaignService.getCampaign(req.params.id, tenantId);
    if (!result)
        throw new errors_js_1.NotFoundError('Campanha', req.params.id);
    res.json({ success: true, data: result });
}));
router.post('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const { name, message, contactIds, scheduledAt } = req.body;
    if (!name || !message || !contactIds?.length) {
        throw new errors_js_1.ValidationError('Nome, mensagem e contatos são obrigatórios');
    }
    const result = await campaignService.createCampaign(tenantId, name, message, contactIds, scheduledAt ? new Date(scheduledAt) : undefined);
    res.status(201).json({ success: true, data: result });
}));
router.post('/:id/start', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const result = await campaignService.startCampaign(req.params.id, tenantId);
    res.json({ success: true, data: result });
}));
router.post('/:id/cancel', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    const result = await campaignService.cancelCampaign(req.params.id, tenantId);
    res.json({ success: true, data: result });
}));
router.delete('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const tenantId = req.tenantId;
    await campaignService.deleteCampaign(req.params.id, tenantId);
    res.json({ success: true });
}));
exports.default = router;
//# sourceMappingURL=campaigns.js.map
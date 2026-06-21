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
const apiKeysService = __importStar(require("../services/api-keys.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const zod_1 = require("zod");
const saveSchema = zod_1.z.object({
    provider: zod_1.z.enum(['OPENAI', 'ANTHROPIC', 'ELEVENLABS']),
    key: zod_1.z.string().min(1, 'API Key é obrigatória'),
});
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware);
router.get('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const keys = await apiKeysService.listApiKeys(req.user.tenantId);
    res.json(keys);
}));
router.post('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { provider, key } = saveSchema.parse(req.body);
    const result = await apiKeysService.saveApiKey(req.user.tenantId, provider, key);
    res.json(result);
}));
router.post('/test', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { provider } = zod_1.z.object({ provider: zod_1.z.enum(['OPENAI', 'ANTHROPIC', 'ELEVENLABS']) }).parse(req.body);
    const result = await apiKeysService.testExistingKey(req.user.tenantId, provider);
    res.json(result);
}));
router.delete('/:provider', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const provider = req.params.provider;
    if (!['OPENAI', 'ANTHROPIC', 'ELEVENLABS'].includes(provider)) {
        throw new errors_js_1.ValidationError('Provider inválido. Use OPENAI, ANTHROPIC ou ELEVENLABS');
    }
    await apiKeysService.deleteApiKey(req.user.tenantId, provider);
    res.json({ success: true });
}));
exports.default = router;
//# sourceMappingURL=api-keys.js.map
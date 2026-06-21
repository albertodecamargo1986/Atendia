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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const knowledgeService = __importStar(require("../services/knowledge.service.js"));
const auth_js_1 = require("../middlewares/auth.js");
const tenant_js_1 = require("../middlewares/tenant.js");
const feature_gate_js_1 = require("../middlewares/feature-gate.js");
const async_handler_js_1 = require("../middlewares/async-handler.js");
const errors_js_1 = require("../lib/errors.js");
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const KNOWLEDGE_UPLOAD_PATH = path_1.default.join(process.cwd(), UPLOAD_DIR, 'knowledge');
// Ensure upload directory exists at module load (async, one-time)
promises_1.default.mkdir(KNOWLEDGE_UPLOAD_PATH, { recursive: true }).catch(() => { });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, KNOWLEDGE_UPLOAD_PATH);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10) },
    fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.txt', '.md', '.csv'];
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Tipo não suportado: ${ext}. Use PDF, TXT, MD ou CSV.`));
        }
    },
});
const router = (0, express_1.Router)();
router.use(auth_js_1.authMiddleware, tenant_js_1.tenantMiddleware, (0, feature_gate_js_1.requireModule)('knowledge'));
router.get('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const knowledge = await knowledgeService.listKnowledge(req.user.tenantId, req.query.agentId);
    res.json(knowledge);
}));
router.get('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const kb = await knowledgeService.getKnowledge(req.user.tenantId, req.params.id);
    res.json(kb);
}));
router.post('/', upload.single('file'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    if (req.file) {
        const agentId = req.body.agentId;
        if (!agentId)
            throw new errors_js_1.ValidationError('agentId é obrigatório');
        const kb = await knowledgeService.createKnowledgeFromFile(req.user.tenantId, agentId, req.file);
        res.status(201).json(kb);
    }
    else {
        const kb = await knowledgeService.createKnowledge(req.user.tenantId, req.body);
        res.status(201).json(kb);
    }
}));
router.delete('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    await knowledgeService.deleteKnowledge(req.user.tenantId, req.params.id);
    res.json({ message: 'Base de conhecimento deletada com sucesso' });
}));
exports.default = router;
//# sourceMappingURL=knowledge.js.map
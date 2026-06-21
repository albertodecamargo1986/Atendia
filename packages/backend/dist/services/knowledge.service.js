"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listKnowledge = listKnowledge;
exports.getKnowledge = getKnowledge;
exports.createKnowledge = createKnowledge;
exports.createKnowledgeFromFile = createKnowledgeFromFile;
exports.deleteKnowledge = deleteKnowledge;
exports.getAgentContext = getAgentContext;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const zod_1 = require("zod");
const errors_js_1 = require("../lib/errors.js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
const createKnowledgeSchema = zod_1.z.object({
    agentId: zod_1.z.string().uuid('ID do agente inválido'),
    fileName: zod_1.z.string().optional(),
    fileType: zod_1.z.string().optional(),
    fileUrl: zod_1.z.string().optional(),
    content: zod_1.z.string().optional(),
});
async function listKnowledge(tenantId, agentId) {
    const where = { tenantId };
    if (agentId)
        where.agentId = agentId;
    return prisma_js_1.default.knowledgeBase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
    });
}
async function getKnowledge(tenantId, knowledgeId) {
    const kb = await prisma_js_1.default.knowledgeBase.findFirst({
        where: { id: knowledgeId, tenantId },
    });
    if (!kb)
        throw new errors_js_1.NotFoundError('Base de conhecimento', knowledgeId);
    return kb;
}
async function createKnowledge(tenantId, data) {
    const parsed = createKnowledgeSchema.parse(data);
    const agent = await prisma_js_1.default.agent.findFirst({
        where: { id: parsed.agentId, tenantId },
    });
    if (!agent)
        throw new errors_js_1.NotFoundError('Agente', parsed.agentId);
    if (!parsed.content && !parsed.fileUrl) {
        throw new errors_js_1.ValidationError('Forneça conteúdo de texto ou um arquivo');
    }
    return prisma_js_1.default.knowledgeBase.create({
        data: {
            tenantId,
            agentId: parsed.agentId,
            fileName: parsed.fileName || 'texto-livre',
            fileType: parsed.fileType || 'text',
            fileUrl: parsed.fileUrl || '',
            content: parsed.content,
            chunkCount: parsed.content ? Math.ceil(parsed.content.length / 500) : 0,
        },
    });
}
async function createKnowledgeFromFile(tenantId, agentId, file) {
    const agent = await prisma_js_1.default.agent.findFirst({
        where: { id: agentId, tenantId },
    });
    if (!agent)
        throw new errors_js_1.NotFoundError('Agente', agentId);
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    let content = '';
    let fileType = ext.replace('.', '');
    if (ext === '.pdf') {
        const dataBuffer = fs_1.default.readFileSync(file.path);
        const pdfData = await (0, pdf_parse_1.default)(dataBuffer);
        content = pdfData.text;
        fileType = 'pdf';
    }
    else if (ext === '.txt' || ext === '.md') {
        content = fs_1.default.readFileSync(file.path, 'utf-8');
        fileType = ext.replace('.', '');
    }
    else if (ext === '.csv') {
        content = fs_1.default.readFileSync(file.path, 'utf-8');
        fileType = 'csv';
    }
    else {
        throw new errors_js_1.ValidationError(`Tipo de arquivo não suportado: ${ext}. Use PDF, TXT, MD ou CSV.`);
    }
    const relativePath = path_1.default.relative(process.cwd(), file.path).replace(/\\/g, '/');
    return prisma_js_1.default.knowledgeBase.create({
        data: {
            tenantId,
            agentId,
            fileName: file.originalname,
            fileType,
            fileUrl: relativePath,
            content,
            chunkCount: Math.ceil(content.length / 500),
        },
    });
}
async function deleteKnowledge(tenantId, knowledgeId) {
    const kb = await prisma_js_1.default.knowledgeBase.findFirst({
        where: { id: knowledgeId, tenantId },
    });
    if (!kb)
        throw new errors_js_1.NotFoundError('Base de conhecimento', knowledgeId);
    if (kb.fileUrl && kb.fileUrl !== '' && kb.fileType !== 'text') {
        const filePath = path_1.default.join(process.cwd(), kb.fileUrl);
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
    }
    return prisma_js_1.default.knowledgeBase.delete({ where: { id: knowledgeId } });
}
async function getAgentContext(agentId, tenantId) {
    const knowledgeBases = await prisma_js_1.default.knowledgeBase.findMany({
        where: { agentId, tenantId },
        select: { content: true, fileName: true },
    });
    return knowledgeBases
        .filter((kb) => kb.content)
        .map((kb) => `--- Fonte: ${kb.fileName} ---\n${kb.content}`)
        .join('\n\n');
}
//# sourceMappingURL=knowledge.service.js.map
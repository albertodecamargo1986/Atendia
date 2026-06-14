import prisma from '../lib/prisma.js';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);

const createKnowledgeSchema = z.object({
  agentId: z.string().uuid('ID do agente inválido'),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  fileUrl: z.string().optional(),
  content: z.string().optional(),
});

export async function listKnowledge(tenantId: string, agentId?: string) {
  const where: any = { tenantId };
  if (agentId) where.agentId = agentId;

  return prisma.knowledgeBase.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getKnowledge(tenantId: string, knowledgeId: string) {
  const kb = await prisma.knowledgeBase.findFirst({
    where: { id: knowledgeId, tenantId },
  });
  if (!kb) throw new NotFoundError('Base de conhecimento', knowledgeId);
  return kb;
}

export async function createKnowledge(tenantId: string, data: z.infer<typeof createKnowledgeSchema>) {
  const parsed = createKnowledgeSchema.parse(data);

  const agent = await prisma.agent.findFirst({
    where: { id: parsed.agentId, tenantId },
  });
  if (!agent) throw new NotFoundError('Agente', parsed.agentId);

  if (!parsed.content && !parsed.fileUrl) {
    throw new ValidationError('Forneça conteúdo de texto ou um arquivo');
  }

  return prisma.knowledgeBase.create({
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

export async function createKnowledgeFromFile(
  tenantId: string,
  agentId: string,
  file: Express.Multer.File
) {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, tenantId },
  });
  if (!agent) throw new NotFoundError('Agente', agentId);

  const ext = path.extname(file.originalname).toLowerCase();
  let content = '';
  let fileType = ext.replace('.', '');

  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(file.path);
    const pdfData = await pdfParse(dataBuffer);
    content = pdfData.text;
    fileType = 'pdf';
  } else if (ext === '.txt' || ext === '.md') {
    content = fs.readFileSync(file.path, 'utf-8');
    fileType = ext.replace('.', '');
  } else if (ext === '.csv') {
    content = fs.readFileSync(file.path, 'utf-8');
    fileType = 'csv';
  } else {
    throw new ValidationError(`Tipo de arquivo não suportado: ${ext}. Use PDF, TXT, MD ou CSV.`);
  }

  const relativePath = path.relative(process.cwd(), file.path).replace(/\\/g, '/');

  return prisma.knowledgeBase.create({
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

export async function deleteKnowledge(tenantId: string, knowledgeId: string) {
  const kb = await prisma.knowledgeBase.findFirst({
    where: { id: knowledgeId, tenantId },
  });
  if (!kb) throw new NotFoundError('Base de conhecimento', knowledgeId);

  if (kb.fileUrl && kb.fileUrl !== '' && kb.fileType !== 'text') {
    const filePath = path.join(process.cwd(), kb.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  return prisma.knowledgeBase.delete({ where: { id: knowledgeId } });
}

export async function getAgentContext(agentId: string, tenantId: string): Promise<string> {
  const knowledgeBases = await prisma.knowledgeBase.findMany({
    where: { agentId, tenantId },
    select: { content: true, fileName: true },
  });

  return knowledgeBases
    .filter((kb) => kb.content)
    .map((kb) => `--- Fonte: ${kb.fileName} ---\n${kb.content}`)
    .join('\n\n');
}

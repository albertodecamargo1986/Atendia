import prisma from '../lib/prisma.js';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { resolveUploadPath, sanitizeFilename, uploadPathToUrl } from '../lib/uploads.js';


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
  const removeUpload = () => { try { fs.unlinkSync(file.path); } catch { /* ignora */ } };

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, tenantId },
  });
  if (!agent) {
    removeUpload();
    throw new NotFoundError('Agente', agentId);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  let content = '';
  let fileType = ext.replace('.', '');

  try {
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
  } catch (err) {
    removeUpload();
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Não foi possível ler o arquivo enviado. Verifique se ele não está corrompido.');
  }

  // URL no formato /uploads/<tenantId>/knowledge/<arquivo>
  const fileUrl = uploadPathToUrl(file.path);

  return prisma.knowledgeBase.create({
    data: {
      tenantId,
      agentId,
      fileName: sanitizeFilename(file.originalname),
      fileType,
      fileUrl,
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
    // Só apaga arquivos dentro de UPLOAD_DIR (protege contra caminhos arbitrários)
    const filePath = resolveUploadPath(kb.fileUrl);
    if (filePath && fs.existsSync(filePath)) {
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

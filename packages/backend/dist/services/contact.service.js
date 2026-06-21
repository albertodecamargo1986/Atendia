"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContact = createContact;
exports.findOrCreateContact = findOrCreateContact;
exports.quickSaveFromConversation = quickSaveFromConversation;
exports.listContacts = listContacts;
exports.getContact = getContact;
exports.updateContact = updateContact;
exports.deleteContact = deleteContact;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const zod_1 = require("zod");
const errors_js_1 = require("../lib/errors.js");
const createContactSchema = zod_1.z.object({
    phone: zod_1.z.string().min(10, 'Telefone inválido'),
    name: zod_1.z.string().min(1, 'Nome é obrigatório'),
    email: zod_1.z.string().email().optional().default(''),
    profilePicUrl: zod_1.z.string().url().optional(),
    isGroup: zod_1.z.boolean().default(false),
    lid: zod_1.z.string().optional(),
    cpfCnpj: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
    zipCode: zod_1.z.string().optional(),
    company: zod_1.z.string().optional(),
    role: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
async function createContact(tenantId, data) {
    const parsed = createContactSchema.parse(data);
    return prisma_js_1.default.contact.create({
        data: { tenantId, ...parsed },
    });
}
async function findOrCreateContact(tenantId, phone, name, profilePicUrl, isGroup, lid) {
    return prisma_js_1.default.contact.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        update: {
            name: name !== phone ? name : undefined,
            profilePicUrl: profilePicUrl || undefined,
            lid: lid || undefined,
        },
        create: {
            tenantId,
            phone,
            name,
            profilePicUrl,
            isGroup: isGroup || false,
            lid,
        },
    });
}
async function quickSaveFromConversation(tenantId, conversationId, extraData) {
    const conversation = await prisma_js_1.default.conversation.findFirst({
        where: { id: conversationId, tenantId },
    });
    if (!conversation)
        throw new errors_js_1.NotFoundError('Conversa', conversationId);
    if (!conversation.contactPhone)
        throw new errors_js_1.ValidationError('Conversa não tem telefone do contato');
    // Whitelist allowed fields to prevent mass assignment
    const allowedFields = ['cpfCnpj', 'address', 'city', 'state', 'zipCode', 'company', 'role', 'notes'];
    const safeExtraData = {};
    if (extraData) {
        for (const key of allowedFields) {
            if (extraData[key] !== undefined) {
                safeExtraData[key] = extraData[key];
            }
        }
    }
    const existing = await prisma_js_1.default.contact.findUnique({
        where: { tenantId_phone: { tenantId, phone: conversation.contactPhone } },
    });
    if (existing) {
        return prisma_js_1.default.contact.update({
            where: { id: existing.id },
            data: { ...safeExtraData },
        });
    }
    return prisma_js_1.default.contact.create({
        data: {
            tenantId,
            phone: conversation.contactPhone,
            name: conversation.contactName || conversation.contactPhone,
            email: conversation.contactEmail || '',
            ...safeExtraData,
        },
    });
}
async function listContacts(tenantId, filters) {
    const page = filters?.page || 1;
    const limit = 40;
    const offset = limit * (page - 1);
    const where = { tenantId };
    if (filters?.search) {
        const search = filters.search.toLowerCase();
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { cpfCnpj: { contains: search, mode: 'insensitive' } },
            { company: { contains: search, mode: 'insensitive' } },
        ];
    }
    const [contacts, count] = await Promise.all([
        prisma_js_1.default.contact.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: limit,
            skip: offset,
            include: { _count: { select: { tickets: true } } },
        }),
        prisma_js_1.default.contact.count({ where }),
    ]);
    return { contacts, count, hasMore: count > offset + contacts.length };
}
async function getContact(tenantId, contactId) {
    const contact = await prisma_js_1.default.contact.findFirst({
        where: { id: contactId, tenantId },
        include: {
            tickets: {
                orderBy: { updatedAt: 'desc' },
                take: 20,
                include: {
                    assignee: { select: { id: true, name: true } },
                    queue: { select: { id: true, name: true, color: true } },
                },
            },
        },
    });
    if (!contact)
        throw new errors_js_1.NotFoundError('Contato', contactId);
    return contact;
}
async function updateContact(tenantId, contactId, data) {
    const contact = await prisma_js_1.default.contact.findFirst({
        where: { id: contactId, tenantId },
    });
    if (!contact)
        throw new errors_js_1.NotFoundError('Contato', contactId);
    return prisma_js_1.default.contact.update({
        where: { id: contactId },
        data,
    });
}
async function deleteContact(tenantId, contactId) {
    const contact = await prisma_js_1.default.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact)
        throw new errors_js_1.NotFoundError('Contato', contactId);
    return prisma_js_1.default.contact.delete({ where: { id: contactId } });
}
//# sourceMappingURL=contact.service.js.map
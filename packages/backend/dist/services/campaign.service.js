"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCampaign = createCampaign;
exports.startCampaign = startCampaign;
exports.listCampaigns = listCampaigns;
exports.getCampaign = getCampaign;
exports.cancelCampaign = cancelCampaign;
exports.deleteCampaign = deleteCampaign;
exports.markRecipientSent = markRecipientSent;
exports.markRecipientFailed = markRecipientFailed;
exports.checkCampaignCompletion = checkCampaignCompletion;
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const errors_js_1 = require("../lib/errors.js");
const bullmq_1 = require("bullmq");
const redis_js_1 = __importDefault(require("../lib/redis.js"));
let campaignQueue = null;
async function getCampaignQueue() {
    if (!campaignQueue) {
        campaignQueue = new bullmq_1.Queue('campaign', { connection: redis_js_1.default });
    }
    return campaignQueue;
}
async function createCampaign(tenantId, name, message, contactIds, scheduledAt) {
    const campaign = await prisma_js_1.default.campaign.create({
        data: {
            tenantId,
            name,
            message,
            status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
            scheduledAt,
            totalRecipients: contactIds.length,
            recipients: {
                create: contactIds.map(contactId => ({ contactId })),
            },
        },
        include: { recipients: true },
    });
    if (!scheduledAt)
        return campaign;
    const queue = await getCampaignQueue();
    const delay = scheduledAt.getTime() - Date.now();
    if (delay <= 0) {
        await startCampaign(campaign.id, tenantId);
    }
    else {
        await queue.add('send-campaign', { campaignId: campaign.id, tenantId }, { delay });
    }
    return campaign;
}
async function startCampaign(campaignId, tenantId) {
    const campaign = await prisma_js_1.default.campaign.findFirst({
        where: { id: campaignId, tenantId },
        include: { recipients: { include: { contact: true } } },
    });
    if (!campaign)
        throw new errors_js_1.NotFoundError('Campanha', campaignId);
    if (campaign.status === 'RUNNING' || campaign.status === 'COMPLETED')
        throw new errors_js_1.ConflictError('Campanha já iniciada/concluída');
    await prisma_js_1.default.campaign.update({
        where: { id: campaignId },
        data: { status: 'RUNNING', startedAt: new Date() },
    });
    const queue = await getCampaignQueue();
    const jobs = campaign.recipients
        .filter(r => r.status === 'PENDING')
        .map(recipient => ({
        name: 'send-campaign-message',
        data: {
            campaignId,
            tenantId,
            recipientId: recipient.id,
            contactId: recipient.contactId,
            contactPhone: recipient.contact.phone,
            message: campaign.message,
        },
        opts: { delay: Math.random() * 5000 },
    }));
    if (jobs.length > 0) {
        await queue.addBulk(jobs);
    }
    return { started: true };
}
async function listCampaigns(tenantId) {
    return prisma_js_1.default.campaign.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { recipients: true } } },
    });
}
async function getCampaign(campaignId, tenantId) {
    return prisma_js_1.default.campaign.findFirst({
        where: { id: campaignId, tenantId },
        include: {
            recipients: { include: { contact: { select: { id: true, name: true, phone: true } } } },
        },
    });
}
async function cancelCampaign(campaignId, tenantId) {
    const campaign = await prisma_js_1.default.campaign.findFirst({ where: { id: campaignId, tenantId } });
    if (!campaign)
        throw new errors_js_1.NotFoundError('Campanha', campaignId);
    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED')
        throw new errors_js_1.ValidationError('Apenas campanhas rascunho/agendadas podem ser canceladas');
    return prisma_js_1.default.campaign.update({
        where: { id: campaignId },
        data: { status: 'CANCELLED' },
    });
}
async function deleteCampaign(campaignId, tenantId) {
    const campaign = await prisma_js_1.default.campaign.findFirst({ where: { id: campaignId, tenantId } });
    if (!campaign)
        throw new errors_js_1.NotFoundError('Campanha', campaignId);
    if (campaign.status === 'RUNNING')
        throw new errors_js_1.ConflictError('Não é possível deletar campanha em execução');
    return prisma_js_1.default.campaign.delete({ where: { id: campaignId } });
}
async function markRecipientSent(recipientId) {
    const recipient = await prisma_js_1.default.campaignContact.findUnique({ where: { id: recipientId } });
    if (!recipient)
        return;
    await prisma_js_1.default.$transaction([
        prisma_js_1.default.campaignContact.update({
            where: { id: recipientId },
            data: { status: 'SENT', sentAt: new Date() },
        }),
        prisma_js_1.default.campaign.update({
            where: { id: recipient.campaignId },
            data: { sentCount: { increment: 1 } },
        }),
    ]);
}
async function markRecipientFailed(recipientId, error) {
    const recipient = await prisma_js_1.default.campaignContact.findUnique({ where: { id: recipientId } });
    if (!recipient)
        return;
    await prisma_js_1.default.$transaction([
        prisma_js_1.default.campaignContact.update({
            where: { id: recipientId },
            data: { status: 'FAILED', error },
        }),
        prisma_js_1.default.campaign.update({
            where: { id: recipient.campaignId },
            data: { failedCount: { increment: 1 } },
        }),
    ]);
}
async function checkCampaignCompletion(campaignId) {
    const campaign = await prisma_js_1.default.campaign.findUnique({
        where: { id: campaignId },
        select: { totalRecipients: true, sentCount: true, failedCount: true },
    });
    if (!campaign)
        return;
    if (campaign.sentCount + campaign.failedCount >= campaign.totalRecipients) {
        await prisma_js_1.default.campaign.update({
            where: { id: campaignId },
            data: { status: 'COMPLETED', completedAt: new Date() },
        });
    }
}
//# sourceMappingURL=campaign.service.js.map
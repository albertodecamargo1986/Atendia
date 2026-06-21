"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCampaignWorker = startCampaignWorker;
const bullmq_1 = require("bullmq");
const redis_js_1 = __importDefault(require("../lib/redis.js"));
const prisma_js_1 = __importDefault(require("../lib/prisma.js"));
const whatsapp_service_js_1 = require("../services/whatsapp.service.js");
const campaign_service_js_1 = require("../services/campaign.service.js");
function isRecipientJob(data) {
    return 'recipientId' in data;
}
function startCampaignWorker() {
    const worker = new bullmq_1.Worker('campaign', async (job) => {
        // Handle top-level 'send-campaign' job (start trigger)
        if (!isRecipientJob(job.data)) {
            const { campaignId, tenantId } = job.data;
            const campaign = await prisma_js_1.default.campaign.findFirst({
                where: { id: campaignId, tenantId },
            });
            if (!campaign || campaign.status !== 'RUNNING') {
                return { skipped: true };
            }
            return { started: true };
        }
        // Handle individual 'send-campaign-message' job
        const { campaignId, tenantId, recipientId, contactPhone, message } = job.data;
        const session = await prisma_js_1.default.whatsAppSession.findFirst({
            where: { tenantId, status: 'CONNECTED' },
        });
        if (!session) {
            await (0, campaign_service_js_1.markRecipientFailed)(recipientId, 'Nenhuma sessão WhatsApp conectada');
            await (0, campaign_service_js_1.checkCampaignCompletion)(campaignId);
            return { success: false, reason: 'no_session' };
        }
        const jid = `${contactPhone}@s.whats.net`;
        try {
            await (0, whatsapp_service_js_1.sendWhatsAppMessage)(session.sessionId, jid, message);
            await (0, campaign_service_js_1.markRecipientSent)(recipientId);
        }
        catch (err) {
            await (0, campaign_service_js_1.markRecipientFailed)(recipientId, err.message || 'Erro ao enviar mensagem');
        }
        await (0, campaign_service_js_1.checkCampaignCompletion)(campaignId);
        return { success: true, recipientId };
    }, {
        connection: redis_js_1.default,
        concurrency: 5,
    });
    worker.on('failed', (job, err) => {
        if (!job)
            return;
        const info = isRecipientJob(job.data)
            ? `recipient ${job.data.recipientId}`
            : `campaign ${job.data.campaignId}`;
        console.error(`Campaign job failed (${info}):`, err.message);
    });
    worker.on('error', (err) => {
        console.error('Campaign Worker error:', err.message);
    });
    return worker;
}
//# sourceMappingURL=campaign.worker.js.map
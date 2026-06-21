"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.offhoursMessageQueue = exports.whatsappOutboundQueue = exports.aiResponseQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_js_1 = __importDefault(require("../lib/redis.js"));
exports.aiResponseQueue = new bullmq_1.Queue('ai-response', {
    connection: redis_js_1.default,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 100 },
    },
});
exports.whatsappOutboundQueue = new bullmq_1.Queue('whatsapp-outbound', {
    connection: redis_js_1.default,
    defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 100 },
    },
});
exports.offhoursMessageQueue = new bullmq_1.Queue('offhours-message', {
    connection: redis_js_1.default,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 50 },
    },
});
//# sourceMappingURL=queues.js.map
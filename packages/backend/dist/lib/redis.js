"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
        const delay = Math.min(times * 200, 2000);
        return delay;
    },
});
redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
});
redis.on('connect', () => {
    console.log('Connected to Redis');
});
exports.default = redis;
//# sourceMappingURL=redis.js.map
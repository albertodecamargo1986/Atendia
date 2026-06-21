"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.heartbeat = heartbeat;
exports.getOnlineUsers = getOnlineUsers;
exports.getOnlineCount = getOnlineCount;
exports.removeFromOnline = removeFromOnline;
const redis_js_1 = __importDefault(require("../lib/redis.js"));
const ONLINE_TTL = 300; // 5 minutos sem atividade = offline
async function heartbeat(userId, tenantId) {
    const key = `online:${tenantId}:${userId}`;
    await redis_js_1.default.set(key, JSON.stringify({ lastSeen: new Date().toISOString() }), 'EX', ONLINE_TTL);
    // Adiciona ao set de usuários online do tenant
    await redis_js_1.default.sadd(`online:tenant:${tenantId}`, userId);
    // Atualiza TTL do set também
    await redis_js_1.default.expire(`online:tenant:${tenantId}`, ONLINE_TTL);
}
async function getOnlineUsers(tenantId) {
    if (tenantId) {
        // Usuários online de um tenant específico
        const userIds = await redis_js_1.default.smembers(`online:tenant:${tenantId}`);
        if (userIds.length === 0)
            return [];
        const pipe = redis_js_1.default.pipeline();
        userIds.forEach(uid => {
            pipe.get(`online:${tenantId}:${uid}`);
        });
        const results = await pipe.exec();
        const users = [];
        for (let i = 0; i < userIds.length; i++) {
            const data = results?.[i]?.[1];
            if (data) {
                try {
                    const parsed = JSON.parse(data);
                    users.push({ userId: userIds[i], lastSeen: parsed.lastSeen });
                }
                catch { /* ignore */ }
            }
        }
        return users;
    }
    // Todos os tenants com usuários online
    const keys = await redis_js_1.default.keys('online:tenant:*');
    const allUsers = [];
    for (const key of keys) {
        const tid = key.replace('online:tenant:', '');
        const userIds = await redis_js_1.default.smembers(key);
        const pipe = redis_js_1.default.pipeline();
        userIds.forEach(uid => {
            pipe.get(`online:${tid}:${uid}`);
        });
        const results = await pipe.exec();
        const users = [];
        for (let i = 0; i < userIds.length; i++) {
            const data = results?.[i]?.[1];
            if (data) {
                try {
                    const parsed = JSON.parse(data);
                    users.push({ userId: userIds[i], lastSeen: parsed.lastSeen });
                }
                catch { /* ignore */ }
            }
        }
        if (users.length > 0) {
            allUsers.push({ tenantId: tid, users });
        }
    }
    return allUsers;
}
async function getOnlineCount() {
    const keys = await redis_js_1.default.keys('online:tenant:*');
    let total = 0;
    for (const key of keys) {
        const count = await redis_js_1.default.scard(key);
        total += count;
    }
    return total;
}
async function removeFromOnline(userId, tenantId) {
    await redis_js_1.default.del(`online:${tenantId}:${userId}`);
    await redis_js_1.default.srem(`online:tenant:${tenantId}`, userId);
}
//# sourceMappingURL=online.service.js.map
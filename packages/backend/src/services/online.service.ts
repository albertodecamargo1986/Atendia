import redis from '../lib/redis.js';

const ONLINE_TTL = 300; // 5 minutos sem atividade = offline

export async function heartbeat(userId: string, tenantId: string) {
  const key = `online:${tenantId}:${userId}`;
  await redis.set(key, JSON.stringify({ lastSeen: new Date().toISOString() }), 'EX', ONLINE_TTL);

  // Adiciona ao set de usuários online do tenant
  await redis.sadd(`online:tenant:${tenantId}`, userId);

  // Atualiza TTL do set também
  await redis.expire(`online:tenant:${tenantId}`, ONLINE_TTL);
}

export async function getOnlineUsers(tenantId?: string) {
  if (tenantId) {
    // Usuários online de um tenant específico
    const userIds = await redis.smembers(`online:tenant:${tenantId}`);
    if (userIds.length === 0) return [];

    const pipe = redis.pipeline();
    userIds.forEach(uid => {
      pipe.get(`online:${tenantId}:${uid}`);
    });
    const results = await pipe.exec();
    const users: { userId: string; lastSeen: string }[] = [];

    for (let i = 0; i < userIds.length; i++) {
      const data = results?.[i]?.[1] as string | null;
      if (data) {
        try {
          const parsed = JSON.parse(data);
          users.push({ userId: userIds[i], lastSeen: parsed.lastSeen });
        } catch { /* ignore */ }
      }
    }
    return users;
  }

  // Todos os tenants com usuários online
  const keys = await redis.keys('online:tenant:*');
  const allUsers: { tenantId: string; users: { userId: string; lastSeen: string }[] }[] = [];

  for (const key of keys) {
    const tid = key.replace('online:tenant:', '');
    const userIds = await redis.smembers(key);
    const pipe = redis.pipeline();
    userIds.forEach(uid => {
      pipe.get(`online:${tid}:${uid}`);
    });
    const results = await pipe.exec();
    const users: { userId: string; lastSeen: string }[] = [];
    for (let i = 0; i < userIds.length; i++) {
      const data = results?.[i]?.[1] as string | null;
      if (data) {
        try {
          const parsed = JSON.parse(data);
          users.push({ userId: userIds[i], lastSeen: parsed.lastSeen });
        } catch { /* ignore */ }
      }
    }
    if (users.length > 0) {
      allUsers.push({ tenantId: tid, users });
    }
  }
  return allUsers;
}

export async function getOnlineCount(): Promise<number> {
  const keys = await redis.keys('online:tenant:*');
  let total = 0;
  for (const key of keys) {
    const count = await redis.scard(key);
    total += count;
  }
  return total;
}

export async function removeFromOnline(userId: string, tenantId: string) {
  await redis.del(`online:${tenantId}:${userId}`);
  await redis.srem(`online:tenant:${tenantId}`, userId);
}

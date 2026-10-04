/**
 * Redis em memória (subconjunto do ioredis usado pelo WhatsApp): set com EX/NX, get, del, incr, expire.
 * A expiração usa Date.now() — funciona com vi.useFakeTimers()/vi.setSystemTime().
 */
export function createFakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number | null }>();

  const alive = (key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry;
  };

  const fake = {
    store,
    async set(key: string, value: string, ...args: any[]) {
      let ttlMs: number | null = null;
      let nx = false;
      for (let i = 0; i < args.length; i++) {
        const a = String(args[i]).toUpperCase();
        if (a === 'EX') ttlMs = Number(args[++i]) * 1000;
        else if (a === 'PX') ttlMs = Number(args[++i]);
        else if (a === 'NX') nx = true;
      }
      if (nx && alive(key)) return null;
      store.set(key, { value: String(value), expiresAt: ttlMs !== null ? Date.now() + ttlMs : null });
      return 'OK';
    },
    async get(key: string) {
      return alive(key)?.value ?? null;
    },
    async del(...keys: string[]) {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n++;
      return n;
    },
    async incr(key: string) {
      const entry = alive(key);
      const next = (entry ? Number(entry.value) : 0) + 1;
      store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    },
    async expire(key: string, seconds: number) {
      const entry = alive(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    reset() {
      store.clear();
    },
  };
  return fake;
}

export type FakeRedis = ReturnType<typeof createFakeRedis>;

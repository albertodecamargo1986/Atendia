import { Pool, PoolConfig } from 'pg';
import { env } from './env';

const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

export const pool = new Pool(poolConfig);

pool.on('error', (err: Error) => {
  console.error('Unexpected database pool error:', err.message);
});

export async function query(text: string, params: unknown[]) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('DB query', { text: text.substring(0, 80), duration: `${duration}ms`, rows: result.rowCount });
  return result;
}

export async function getClient() {
  const client = await pool.connect();
  return client;
}

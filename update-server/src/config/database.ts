import { Pool, PoolConfig } from 'pg';
import { env } from './env';

const poolConfig: PoolConfig = {
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Executed query', { text: text.substring(0, 80), duration: `${duration}ms`, rows: result.rowCount });
  return result;
}

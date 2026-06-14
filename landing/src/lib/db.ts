import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://atend:atend@127.0.0.1:5432/atend_ia',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

export async function query(text: string, params: unknown[] = []) {
  const result = await pool.query(text, params);
  return { rows: result.rows, rowCount: result.rowCount };
}

export async function initDatabase() {
  // Tables are managed by Prisma migrations on the backend
  // No need to create tables here
}

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://atend:atend@localhost:5432/atend_ia';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const pool = new Pool({ connectionString: DATABASE_URL });

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const result = await pool.query('SELECT filename FROM _migrations ORDER BY id');
  return result.rows.map(r => r.filename);
}

async function runMigrations(direction = 'up') {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable();

    if (direction === 'up') {
      const applied = await getAppliedMigrations();
      const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        if (applied.includes(file)) {
          console.log(`  SKIP (already applied): ${file}`);
          continue;
        }

        console.log(`  Applying: ${file}`);
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');

        console.log(`  OK: ${file}`);
      }

      console.log('\nAll migrations applied successfully!');
    } else if (direction === 'down') {
      const applied = await getAppliedMigrations();
      if (applied.length === 0) {
        console.log('No migrations to rollback.');
        return;
      }

      const lastMigration = applied[applied.length - 1];
      console.log(`  Rolling back: ${lastMigration}`);

      await client.query('BEGIN');
      await client.query(`DROP TABLE IF EXISTS _migrations CASCADE`);
      // Note: this is a simple rollback that removes the tracking table.
      // For production, implement proper down migrations.
      await client.query('COMMIT');

      console.log('Rollback complete.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

const direction = process.argv[2] || 'up';
runMigrations(direction);

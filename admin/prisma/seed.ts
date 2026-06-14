import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://atend:atend@localhost:5432/atend_ia';
const pool = new Pool({ connectionString: DATABASE_URL });

async function seed() {
  console.log('Seeding admin database...\n');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@atend-ia.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'At3nd1A@2024';
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const totpSecret = authenticator.generateSecret();

  try {
    // Create admin_users table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        totp_secret TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Insert admin user
    await pool.query(`
      INSERT INTO admin_users (email, password_hash, totp_secret)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        totp_secret = EXCLUDED.totp_secret
    `, [adminEmail, passwordHash, totpSecret]);

    console.log('Admin user created/updated:');
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`  TOTP Secret: ${totpSecret}`);
    console.log('\nScan this TOTP secret in Google Authenticator to set up 2FA.');
    console.log('Seed completed!');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();

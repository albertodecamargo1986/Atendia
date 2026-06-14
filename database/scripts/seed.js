const { Pool } = require('pg');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://atend:atend@localhost:5432/atend_ia';
const pool = new Pool({ connectionString: DATABASE_URL });

const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateSerial() {
  const segments = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => CHARS[crypto.randomInt(CHARS.length)]).join('')
  );
  return `ATND-${segments.join('-')}`;
}

async function seed() {
  console.log('Seeding database with sample data...\n');

  try {
    // Create sample customers
    const customers = [
      { name: 'João Silva', email: 'joao@empresa.com.br', cpf_cnpj: '12345678901', phone: '11999998888' },
      { name: 'Maria Oliveira', email: 'maria@loja.com.br', cpf_cnpj: '98765432100', phone: '11988887777' },
      { name: 'Pedro Tech LTDA', email: 'pedro@tech.com.br', cpf_cnpj: '11222333000144', phone: '21977776666' },
    ];

    for (const c of customers) {
      await pool.query(
        'INSERT INTO customers (name, email, cpf_cnpj, phone) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING RETURNING id',
        [c.name, c.email, c.cpf_cnpj, c.phone]
      );
    }
    console.log('  Created sample customers');

    // Create sample licenses
    const customerResult = await pool.query('SELECT id FROM customers LIMIT 3');
    const plans = ['monthly', 'quarterly', 'semiannual', 'annual'];

    for (let i = 0; i < customerResult.rows.length; i++) {
      const customerId = customerResult.rows[i].id;
      const plan = plans[i % plans.length];
      const serial = generateSerial();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (plan === 'monthly' ? 30 : plan === 'quarterly' ? 90 : plan === 'semiannual' ? 180 : 365));

      await pool.query(
        `INSERT INTO licenses (customer_id, serial, plan, status, expires_at, activated_at, last_validation)
         VALUES ($1, $2, $3, 'active', $4, NOW(), NOW())`,
        [customerId, serial, plan, expiresAt.toISOString()]
      );
      console.log(`  License: ${serial} (${plan})`);
    }

    // Create sample payments
    for (const row of customerResult.rows) {
      const licenseResult = await pool.query('SELECT id FROM licenses WHERE customer_id = $1 LIMIT 1', [row.id]);
      if (licenseResult.rows.length > 0) {
        await pool.query(
          `INSERT INTO payments (customer_id, license_id, gateway, amount, status, paid_at)
           VALUES ($1, $2, 'mercado_pago', 147.00, 'paid', NOW())`,
          [row.id, licenseResult.rows[0].id]
        );
      }
    }
    console.log('  Created sample payments');

    console.log('\nSeed completed successfully!');
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();

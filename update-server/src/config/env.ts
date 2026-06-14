import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '3200', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://atend:atend@localhost:5432/atend_ia',
  releasesDir: process.env.RELEASES_DIR || './releases',
  rsaPrivateKeyPath: process.env.RSA_PRIVATE_KEY_PATH || './keys/private.pem',
  rsaPublicKeyPath: process.env.RSA_PUBLIC_KEY_PATH || './keys/public.pem',
  adminApiKey: process.env.ADMIN_API_KEY || 'dev-admin-key',
};

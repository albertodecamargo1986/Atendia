/**
 * Cifragem de segredos guardados no banco (chaves de IA, token/App Secret da API oficial do WhatsApp).
 * AES-256-CBC com chave derivada de SESSION_ENCRYPTION_KEY (scrypt + salt fixo) — o MESMO esquema
 * usado desde sempre pelas chaves de IA (TenantApiKey), então valores antigos continuam legíveis.
 * A chave é derivada na 1ª utilização (importar o módulo não exige a variável de ambiente).
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
// TECH DEBT (herdado de api-keys.service): salt fixo; trocar quebraria a leitura dos valores já salvos.
const SALT = 'atendia-api-keys-salt';

let derivedKey: Buffer | null = null;

function key(): Buffer {
  if (derivedKey) return derivedKey;
  const secret = process.env.SESSION_ENCRYPTION_KEY;
  if (!secret) throw new Error('SESSION_ENCRYPTION_KEY is required. Set it in your .env file.');
  derivedKey = crypto.scryptSync(secret, SALT, 32);
  return derivedKey;
}

export function encryptSecret(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptSecret(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** "••••1234": só os últimos 4 caracteres (nunca o segredo inteiro para o painel). */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}

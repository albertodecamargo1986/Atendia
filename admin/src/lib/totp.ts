import { authenticator } from "otplib";
import QRCode from "qrcode";

const ISSUER = "AtendIA Admin";

/**
 * Generate a new TOTP secret for a user.
 */
export function generateSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Verify a TOTP token against a stored secret.
 */
export function verifyToken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Generate a QR code data URL for Google Authenticator setup.
 */
export async function generateQRCode(
  secret: string,
  email: string
): Promise<string> {
  const otpauth = authenticator.keyuri(email, ISSUER, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauth);
  return qrDataUrl;
}

/**
 * Generate the otpauth:// URI for manual entry.
 */
export function generateURI(secret: string, email: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

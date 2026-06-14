import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export function calculateSHA512(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export function signRelease(fileHash: string, version: string): string {
  const privateKey = fs.readFileSync(env.rsaPrivateKeyPath, 'utf8');
  const dataToSign = `${version}:${fileHash}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(dataToSign);
  sign.end();
  return sign.sign(privateKey, 'base64');
}

export function verifySignature(fileHash: string, version: string, signature: string): boolean {
  try {
    if (!fs.existsSync(env.rsaPublicKeyPath)) return false;
    const publicKey = fs.readFileSync(env.rsaPublicKeyPath, 'utf8');
    const dataToVerify = `${version}:${fileHash}`;
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(dataToVerify);
    verify.end();
    return verify.verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
}

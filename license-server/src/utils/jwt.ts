import fs from 'fs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

let privateKey: string;
let publicKey: string;

function getPrivateKey(): string {
  if (!privateKey) {
    privateKey = fs.readFileSync(env.RSA_PRIVATE_KEY_PATH, 'utf8');
  }
  return privateKey;
}

function getPublicKey(): string {
  if (!publicKey) {
    publicKey = fs.readFileSync(env.RSA_PUBLIC_KEY_PATH, 'utf8');
  }
  return publicKey;
}

export interface TokenPayload {
  sub: string;       // serial
  hwid: string;
  plan: string;
  exp: number;
  iat: number;
  iss: string;
}

export interface SignOptions {
  serial: string;
  hwid: string;
  plan: string;
}

export function signToken(options: SignOptions): string {
  const payload = {
    sub: options.serial,
    hwid: options.hwid,
    plan: options.plan,
    iss: 'atend-ia-license-server',
  };

  const token = jwt.sign(payload, getPrivateKey(), {
    algorithm: 'RS256',
    expiresIn: env.JWT_EXPIRES_IN,
  });

  return token;
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, getPublicKey(), {
    algorithms: ['RS256'],
    issuer: 'atend-ia-license-server',
  }) as TokenPayload;

  return decoded;
}

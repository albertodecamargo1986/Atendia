import crypto from 'crypto';

/**
 * Valida o header `x-signature` do Mercado Pago.
 * Formato: "ts=<timestamp>,v1=<hmac>"; manifest oficial:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * (data.id vem da query string; se alfanumérico, em minúsculas).
 */
export function verifyMercadoPagoSignature(params: {
  xSignature?: string | null;
  xRequestId?: string | null;
  dataId?: string | null;
  secret: string;
}): boolean {
  const { xSignature, xRequestId, secret } = params;
  if (!secret || !xSignature) return false;

  let ts = '';
  let v1 = '';
  for (const part of xSignature.split(',')) {
    const [rawKey, ...rest] = part.split('=');
    const key = rawKey?.trim();
    const value = rest.join('=').trim();
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }
  if (!ts || !v1) return false;

  let manifest = '';
  if (params.dataId) {
    const id = /^[a-z0-9]+$/i.test(params.dataId) ? params.dataId.toLowerCase() : params.dataId;
    manifest += `id:${id};`;
  }
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(v1, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual exige buffers do mesmo tamanho
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

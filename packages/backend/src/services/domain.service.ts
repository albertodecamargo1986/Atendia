/**
 * Administração › Domínio e HTTPS (somente SUPER_ADMIN).
 *
 * O backend roda dentro de um container e NÃO consegue mudar o Caddy/.env do
 * servidor. Por isso ele apenas grava um PEDIDO em um arquivo de controle
 * (CONTROL_DIR/domain-request.json, volume bind ./control:/app/control). No
 * servidor (host), o cron executa `atendia aplicar-dominio-pendente` a cada
 * minuto: ele revalida domínio/e-mail com as mesmas regras, confere o DNS,
 * aplica (SITE_ADDRESS, PUBLIC_URL, ACME_EMAIL + recria web/backend) e grava o
 * resultado em CONTROL_DIR/domain-status.json.
 *
 * As regras de validação aqui precisam continuar IGUAIS às do install/atendia
 * (valid_domain_strict / valid_email_strict).
 */
import { promises as fsp, constants as fsConstants } from 'node:fs';
import dns from 'node:dns';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { AppError, ValidationError, ConflictError } from '../lib/errors.js';

export const REQUEST_FILE = 'domain-request.json';
export const STATUS_FILE = 'domain-status.json';
const IP_CACHE_MS = 10 * 60 * 1000;
const IP_LOOKUP_TIMEOUT_MS = 5000;

// ─── Validação ───────────────────────────────────────────────────────────────

/**
 * Hostname estrito: rótulos [a-z0-9-] (1–63, sem hífen no início/fim), pelo
 * menos um ponto, TLD só com letras (≥2), total ≤253, tudo minúsculo.
 * Por construção recusa IPs, "localhost", espaços e qualquer caractere de shell.
 */
const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** TLDs que nunca recebem certificado público (Let's Encrypt). */
const RESERVED_TLDS = new Set(['localhost', 'local', 'internal', 'invalid', 'test', 'example', 'lan', 'home', 'corp']);

/** E-mail estrito (mesma regra do install/atendia: valid_email_strict). */
const EMAIL_RE = /^[A-Za-z0-9._+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isValidHostname(value: string): boolean {
  if (typeof value !== 'string' || value.length < 4 || value.length > 253) return false;
  if (!HOSTNAME_RE.test(value)) return false;
  const tld = value.slice(value.lastIndexOf('.') + 1);
  return !RESERVED_TLDS.has(tld);
}

export function isValidEmail(value: string): boolean {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

export function isIPv4(value: string | null | undefined): value is string {
  return typeof value === 'string' && IPV4_RE.test(value);
}

/**
 * Normalização amigável do que o usuário digita: tira espaços das pontas,
 * "http(s)://", uma barra final e o ponto final do FQDN, e põe em minúsculo.
 * Espaços no meio NÃO são removidos (o domínio fica inválido).
 */
export function normalizeDomainInput(raw: string): string {
  let v = String(raw ?? '').trim().toLowerCase();
  v = v.replace(/^https?:\/\//, '');
  v = v.replace(/\/+$/, '');
  v = v.replace(/\.$/, '');
  return v;
}

export const domainSchema = z
  .string({ required_error: 'Informe o domínio', invalid_type_error: 'Domínio inválido' })
  .max(300, 'Domínio muito longo')
  .transform(normalizeDomainInput)
  .refine((v) => v.length > 0, 'Informe o domínio')
  .refine(isValidHostname, {
    message:
      'Domínio inválido. Use só letras, números, hífens e pontos, sem espaços (exemplo: minhaempresa.duckdns.org). Endereço IP não vale.',
  });

export const emailSchema = z
  .string({ required_error: 'Informe o e-mail', invalid_type_error: 'E-mail inválido' })
  .max(254, 'E-mail muito longo')
  .transform((v) => v.trim().toLowerCase())
  .refine(isValidEmail, { message: 'E-mail inválido (exemplo: voce@gmail.com)' });

export const checkDnsBodySchema = z.object({ domain: domainSchema });
export const applyBodySchema = z.object({ domain: domainSchema, email: emailSchema });

// ─── Arquivos de controle ────────────────────────────────────────────────────

export interface DomainRequest {
  domain: string;
  email: string;
  requestedBy: string;
  requestedAt: string;
}

export interface DomainStatus {
  state: 'applied' | 'error' | 'pending';
  message: string;
  domain: string | null;
  appliedAt: string | null;
}

const requestFileSchema = z.object({
  domain: z.string(),
  email: z.string(),
  requestedBy: z.string().optional().default(''),
  requestedAt: z.string().optional().default(''),
});

const statusFileSchema = z.object({
  state: z.enum(['applied', 'error', 'pending']),
  message: z.string().optional().default(''),
  domain: z.string().nullable().optional().default(null),
  appliedAt: z.string().nullable().optional().default(null),
});

export function getControlDir(): string {
  return path.resolve(process.env.CONTROL_DIR?.trim() || '/app/control');
}

export class ControlDirUnavailableError extends AppError {
  constructor() {
    super(
      'O servidor ainda não está preparado para trocar o domínio pelo painel. ' +
        'Peça para quem administra o servidor rodar, no terminal SSH:  sudo atendia update  ' +
        '(ou configure direto com:  sudo atendia dominio SEU_DOMINIO).',
      'CONTROL_DIR_UNAVAILABLE',
      503,
    );
  }
}

/** true se a pasta de controle existe e o backend consegue gravar nela. */
export async function isControlDirWritable(dir = getControlDir()): Promise<boolean> {
  try {
    const st = await fsp.stat(dir);
    if (!st.isDirectory()) return false;
    await fsp.access(dir, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Grava JSON de forma atômica (arquivo temporário na mesma pasta + rename). */
export async function writeJsonAtomic(dir: string, fileName: string, data: unknown): Promise<void> {
  if (!(await isControlDirWritable(dir))) throw new ControlDirUnavailableError();
  const target = path.join(dir, fileName);
  const tmp = path.join(dir, `.${fileName}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o640, flag: 'wx' });
    await fsp.rename(tmp, target);
  } catch (err) {
    await fsp.unlink(tmp).catch(() => undefined);
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS' || code === 'ENOENT') {
      throw new ControlDirUnavailableError();
    }
    throw err;
  }
}

async function readJsonFile<T>(file: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T | null> {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    if (raw.length > 64 * 1024) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readRequest(dir = getControlDir()): Promise<DomainRequest | null> {
  return readJsonFile(path.join(dir, REQUEST_FILE), requestFileSchema);
}

export async function readStatus(dir = getControlDir()): Promise<DomainStatus | null> {
  return readJsonFile(path.join(dir, STATUS_FILE), statusFileSchema);
}

// ─── IP público do servidor ──────────────────────────────────────────────────

let ipCache: { ip: string; at: number } | null = null;

/** Só para testes. */
export function _resetServerIpCache(): void {
  ipCache = null;
}

/**
 * IP público do servidor: SERVER_PUBLIC_IP (preenchido pelo instalador); se
 * ausente, consulta https://api.ipify.org (timeout 5s, cache de 10 minutos).
 */
export async function getServerPublicIp(now = Date.now()): Promise<string | null> {
  const fromEnv = process.env.SERVER_PUBLIC_IP?.trim();
  if (isIPv4(fromEnv)) return fromEnv;
  if (ipCache && now - ipCache.at < IP_CACHE_MS) return ipCache.ip;
  try {
    const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(IP_LOOKUP_TIMEOUT_MS) });
    if (!res.ok) return null;
    const ip = (await res.text()).trim();
    if (!isIPv4(ip)) return null;
    ipCache = { ip, at: now };
    return ip;
  } catch {
    return null;
  }
}

// ─── DNS ─────────────────────────────────────────────────────────────────────

export interface DnsCheckResult {
  ok: boolean;
  domain: string;
  resolvedIps: string[];
  serverIp: string | null;
  message: string;
}

/**
 * Compara os IPs (registro A) do domínio com o IP do servidor.
 * OK somente se houver ao menos um IP e TODOS forem o do servidor
 * (mesma regra do install/atendia, senão o certificado pode falhar).
 */
export function compareDnsToServer(domain: string, resolvedIps: string[], serverIp: string | null): DnsCheckResult {
  const ips = Array.from(new Set(resolvedIps.filter((ip) => isIPv4(ip)))).sort();
  if (!serverIp) {
    return {
      ok: false, domain, resolvedIps: ips, serverIp: null,
      message: 'Não consegui descobrir o IP público deste servidor. Tente de novo em alguns minutos.',
    };
  }
  if (ips.length === 0) {
    return {
      ok: false, domain, resolvedIps: ips, serverIp,
      message: `O domínio ${domain} ainda não aponta para nenhum IP. Confira se ele foi criado e se o IP ${serverIp} foi salvo. Depois de salvar, pode levar alguns minutos.`,
    };
  }
  const others = ips.filter((ip) => ip !== serverIp);
  if (others.length === 0) {
    return {
      ok: true, domain, resolvedIps: ips, serverIp,
      message: `Tudo certo! ${domain} aponta para este servidor (${serverIp}).`,
    };
  }
  if (ips.includes(serverIp)) {
    return {
      ok: false, domain, resolvedIps: ips, serverIp,
      message: `O domínio ${domain} aponta para este servidor, mas também para outro(s) IP(s): ${others.join(', ')}. Deixe só o IP ${serverIp}.`,
    };
  }
  return {
    ok: false, domain, resolvedIps: ips, serverIp,
    message: `O domínio ${domain} aponta para ${ips.join(', ')}, mas o IP deste servidor é ${serverIp}. Corrija o IP no DuckDNS (ou no registro A) e espere alguns minutos.`,
  };
}

export interface DnsDeps {
  resolve4?: (host: string) => Promise<string[]>;
  getServerIp?: () => Promise<string | null>;
}

async function defaultResolve4(host: string): Promise<string[]> {
  try {
    return await dns.promises.resolve4(host);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'ESERVFAIL' || code === 'ENONAME') return [];
    throw err;
  }
}

export async function checkDns(rawDomain: unknown, deps: DnsDeps = {}): Promise<DnsCheckResult> {
  const { domain } = checkDnsBodySchema.parse({ domain: rawDomain });
  const resolve4 = deps.resolve4 ?? defaultResolve4;
  const getIp = deps.getServerIp ?? (() => getServerPublicIp());
  let resolved: string[] = [];
  try {
    resolved = await resolve4(domain);
  } catch {
    resolved = [];
  }
  return compareDnsToServer(domain, resolved, await getIp());
}

// ─── Visão geral / pedido ────────────────────────────────────────────────────

function hostFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export async function getDomainInfo() {
  const publicUrl = process.env.PUBLIC_URL?.trim().replace(/\/+$/, '') || null;
  const isHttps = !!publicUrl && publicUrl.startsWith('https://');
  const host = hostFromUrl(publicUrl ?? undefined);
  const currentDomain = host && isValidHostname(host) ? host : null;
  const dir = getControlDir();
  const [serverIp, request, status, controlDirReady] = await Promise.all([
    getServerPublicIp(),
    readRequest(dir),
    readStatus(dir),
    isControlDirWritable(dir),
  ]);
  return {
    publicUrl,
    isHttps,
    serverIp,
    currentDomain,
    request,
    status,
    controlDirReady,
    // Base da URL do webhook da Meta (Cloud API): {PUBLIC_URL}/api/whatsapp/cloud/webhook/{sessionId}
    webhookBaseUrl: isHttps && publicUrl ? `${publicUrl}/api/whatsapp/cloud/webhook/` : null,
  };
}

export async function applyDomain(body: unknown, requestedBy: string, deps: DnsDeps = {}) {
  const { domain, email } = applyBodySchema.parse(body ?? {});
  const dir = getControlDir();

  const currentHost = hostFromUrl(process.env.PUBLIC_URL?.trim());
  if (currentHost === domain && process.env.PUBLIC_URL?.trim().startsWith('https://')) {
    throw new ConflictError(`O domínio ${domain} já está em uso com HTTPS.`);
  }

  if (!(await isControlDirWritable(dir))) throw new ControlDirUnavailableError();

  const dnsResult = await checkDns(domain, deps);
  if (!dnsResult.ok) throw new ValidationError(dnsResult.message);

  const request: DomainRequest = {
    domain,
    email,
    requestedBy: String(requestedBy || '').slice(0, 254),
    requestedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(dir, REQUEST_FILE, request);
  return {
    request,
    message: `Pedido registrado. Em até 1 minuto o servidor aplica ${domain}; o painel fica fora do ar por cerca de 1 minuto e depois passa a abrir em https://${domain}`,
  };
}

export async function cancelRequest() {
  const file = path.join(getControlDir(), REQUEST_FILE);
  try {
    await fsp.unlink(file);
    return { cancelled: true, message: 'Pedido cancelado.' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { cancelled: false, message: 'Não havia pedido pendente.' };
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') throw new ControlDirUnavailableError();
    throw err;
  }
}

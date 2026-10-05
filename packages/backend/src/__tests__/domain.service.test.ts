import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isValidHostname,
  isValidEmail,
  normalizeDomainInput,
  domainSchema,
  emailSchema,
  compareDnsToServer,
  checkDns,
  writeJsonAtomic,
  applyDomain,
  cancelRequest,
  getDomainInfo,
  getServerPublicIp,
  readRequest,
  _resetServerIpCache,
  REQUEST_FILE,
  STATUS_FILE,
} from '../services/domain.service.js';

describe('domínio — validação de hostname', () => {
  it('aceita domínios comuns (DuckDNS, .com.br, subdomínios)', () => {
    for (const d of ['minhaempresa.duckdns.org', 'atendia.com.br', 'painel.loja-x.com', 'a1.b2.co', 'xn--acaf-1na.com.br']) {
      expect(isValidHostname(d)).toBe(true);
    }
  });

  it('recusa IPs, localhost, espaços, maiúsculas e caracteres de shell', () => {
    const ruins = [
      '', 'localhost', 'meusite', '192.168.0.1', '34.10.20.30', 'meu site.com', ' a.com', 'A.COM',
      'a.com;rm -rf /', 'a.com && reboot', '$(id).com', '`id`.com', 'a.com|cat', "a'.com", 'a".com',
      'a.com\n', 'a_b.com', '-a.com', 'a-.com', 'a..com', '.a.com', 'a.com.', 'a.c', 'a.c0m', 'a.123',
      'app.localhost', 'servidor.local', 'x.internal', 'x.test', 'a.com/path', 'http://a.com', 'a.com:8080',
    ];
    for (const d of ruins) expect(isValidHostname(d), d).toBe(false);
  });

  it('limita rótulo a 63 e o total a 253 caracteres', () => {
    expect(isValidHostname(`${'a'.repeat(63)}.com`)).toBe(true);
    expect(isValidHostname(`${'a'.repeat(64)}.com`)).toBe(false);
    const longo = `${Array(5).fill('a'.repeat(60)).join('.')}.com`; // 304 chars
    expect(longo.length).toBeGreaterThan(253);
    expect(isValidHostname(longo)).toBe(false);
  });

  it('normaliza o que o usuário digita (https://, barra final, maiúsculas)', () => {
    expect(normalizeDomainInput('  HTTPS://MinhaEmpresa.DuckDNS.org/  ')).toBe('minhaempresa.duckdns.org');
    expect(normalizeDomainInput('http://a.com.br.')).toBe('a.com.br');
    expect(domainSchema.parse(' Loja.DuckDNS.org ')).toBe('loja.duckdns.org');
    expect(domainSchema.safeParse('meu site.com').success).toBe(false);
    expect(domainSchema.safeParse('a.com/x/y').success).toBe(false);
    expect(domainSchema.safeParse(123).success).toBe(false);
  });
});

describe('domínio — validação de e-mail', () => {
  it('aceita e-mails normais e normaliza para minúsculo', () => {
    expect(isValidEmail('voce@gmail.com')).toBe(true);
    expect(isValidEmail('nome.sobrenome+tag@empresa.com.br')).toBe(true);
    expect(emailSchema.parse('  Voce@Gmail.COM ')).toBe('voce@gmail.com');
  });

  it('recusa e-mails inválidos ou com caracteres perigosos', () => {
    for (const e of ['', 'voce', 'voce@', '@gmail.com', 'voce@gmail', 'a b@c.com', 'a@b.c', "a'@b.com", 'a@b.com;id', '$(id)@b.com', 'a@-b.com', `${'a'.repeat(250)}@b.com`]) {
      expect(isValidEmail(e), e).toBe(false);
    }
  });
});

describe('domínio — comparação DNS × IP do servidor', () => {
  it('OK quando todos os IPs são o do servidor', () => {
    const r = compareDnsToServer('a.duckdns.org', ['34.1.2.3'], '34.1.2.3');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/Tudo certo/);
  });

  it('falha quando aponta para outro IP', () => {
    const r = compareDnsToServer('a.duckdns.org', ['1.1.1.1'], '34.1.2.3');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('34.1.2.3');
    expect(r.resolvedIps).toEqual(['1.1.1.1']);
  });

  it('falha quando há IP extra além do servidor', () => {
    const r = compareDnsToServer('a.duckdns.org', ['34.1.2.3', '9.9.9.9', '34.1.2.3'], '34.1.2.3');
    expect(r.ok).toBe(false);
    expect(r.resolvedIps).toEqual(['34.1.2.3', '9.9.9.9']);
    expect(r.message).toContain('9.9.9.9');
  });

  it('falha quando o domínio não resolve ou o IP do servidor é desconhecido', () => {
    expect(compareDnsToServer('a.duckdns.org', [], '34.1.2.3').ok).toBe(false);
    expect(compareDnsToServer('a.duckdns.org', ['34.1.2.3'], null).ok).toBe(false);
  });

  it('checkDns valida o domínio antes de consultar o DNS', async () => {
    const resolve4 = vi.fn(async () => ['34.1.2.3']);
    await expect(checkDns('a.com;reboot', { resolve4, getServerIp: async () => '34.1.2.3' })).rejects.toThrow();
    expect(resolve4).not.toHaveBeenCalled();
    const ok = await checkDns('HTTPS://A.DuckDNS.org/', { resolve4, getServerIp: async () => '34.1.2.3' });
    expect(resolve4).toHaveBeenCalledWith('a.duckdns.org');
    expect(ok.ok).toBe(true);
  });

  it('checkDns trata erro de DNS como "não resolve"', async () => {
    const r = await checkDns('nao-existe.duckdns.org', {
      resolve4: async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); },
      getServerIp: async () => '34.1.2.3',
    });
    expect(r.ok).toBe(false);
    expect(r.resolvedIps).toEqual([]);
  });
});

describe('domínio — IP público do servidor', () => {
  const oldIp = process.env.SERVER_PUBLIC_IP;
  beforeEach(() => _resetServerIpCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    if (oldIp === undefined) delete process.env.SERVER_PUBLIC_IP; else process.env.SERVER_PUBLIC_IP = oldIp;
  });

  it('usa SERVER_PUBLIC_IP quando válido (sem rede)', async () => {
    process.env.SERVER_PUBLIC_IP = '34.5.6.7';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await getServerPublicIp()).toBe('34.5.6.7');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem variável: consulta ipify uma vez e guarda em cache por 10 minutos', async () => {
    delete process.env.SERVER_PUBLIC_IP;
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '35.1.1.1\n' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getServerPublicIp(1000)).toBe('35.1.1.1');
    expect(await getServerPublicIp(1000 + 9 * 60_000)).toBe('35.1.1.1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getServerPublicIp(1000 + 11 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resposta inválida ou erro de rede => null', async () => {
    delete process.env.SERVER_PUBLIC_IP;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '<html>' })));
    expect(await getServerPublicIp()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
    expect(await getServerPublicIp()).toBeNull();
  });
});

describe('domínio — arquivos de controle', () => {
  let dir: string;
  const oldDir = process.env.CONTROL_DIR;
  const oldUrl = process.env.PUBLIC_URL;
  const oldIp = process.env.SERVER_PUBLIC_IP;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atendia-control-'));
    process.env.CONTROL_DIR = dir;
    process.env.PUBLIC_URL = 'http://34.1.2.3';
    process.env.SERVER_PUBLIC_IP = '34.1.2.3';
  });
  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
    const restore = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    restore('CONTROL_DIR', oldDir);
    restore('PUBLIC_URL', oldUrl);
    restore('SERVER_PUBLIC_IP', oldIp);
  });

  it('writeJsonAtomic grava o arquivo completo e não deixa temporários', async () => {
    await writeJsonAtomic(dir, 'x.json', { a: 1 });
    await writeJsonAtomic(dir, 'x.json', { a: 2 });
    expect(JSON.parse(await fsp.readFile(path.join(dir, 'x.json'), 'utf8'))).toEqual({ a: 2 });
    expect((await fsp.readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('writeJsonAtomic dá 503 (instrução de "atendia update") se a pasta não existe', async () => {
    await expect(writeJsonAtomic(path.join(dir, 'nao-existe'), 'x.json', {})).rejects.toMatchObject({
      statusCode: 503,
      code: 'CONTROL_DIR_UNAVAILABLE',
    });
  });

  it('applyDomain exige DNS OK, grava o pedido e cancelRequest remove', async () => {
    const deps = { resolve4: async () => ['34.1.2.3'], getServerIp: async () => '34.1.2.3' };
    const r = await applyDomain({ domain: 'Loja.DuckDNS.org', email: 'Dono@Gmail.com' }, 'admin@x.com', deps);
    expect(r.request).toMatchObject({ domain: 'loja.duckdns.org', email: 'dono@gmail.com', requestedBy: 'admin@x.com' });
    const saved = JSON.parse(await fsp.readFile(path.join(dir, REQUEST_FILE), 'utf8'));
    expect(saved.domain).toBe('loja.duckdns.org');
    expect(typeof saved.requestedAt).toBe('string');
    expect(await readRequest(dir)).toMatchObject({ domain: 'loja.duckdns.org' });

    expect(await cancelRequest()).toMatchObject({ cancelled: true });
    expect(await readRequest(dir)).toBeNull();
    expect(await cancelRequest()).toMatchObject({ cancelled: false });
  });

  it('applyDomain recusa quando o DNS não aponta para o servidor (nada é gravado)', async () => {
    const deps = { resolve4: async () => ['8.8.8.8'], getServerIp: async () => '34.1.2.3' };
    await expect(applyDomain({ domain: 'loja.duckdns.org', email: 'a@b.com' }, 'x', deps)).rejects.toMatchObject({ statusCode: 422 });
    await expect(fsp.access(path.join(dir, REQUEST_FILE))).rejects.toThrow();
  });

  it('applyDomain recusa domínio/e-mail inválidos', async () => {
    const deps = { resolve4: async () => ['34.1.2.3'], getServerIp: async () => '34.1.2.3' };
    await expect(applyDomain({ domain: 'a.com;reboot', email: 'a@b.com' }, 'x', deps)).rejects.toThrow();
    await expect(applyDomain({ domain: 'a.duckdns.org', email: 'nao-e-email' }, 'x', deps)).rejects.toThrow();
  });

  it('getDomainInfo lê situação, pedido e status (ignora JSON inválido)', async () => {
    await fsp.writeFile(path.join(dir, STATUS_FILE), JSON.stringify({ state: 'applied', message: 'ok', domain: 'a.duckdns.org', appliedAt: '2026-10-04T10:00:00Z' }));
    const info = await getDomainInfo();
    expect(info).toMatchObject({ publicUrl: 'http://34.1.2.3', isHttps: false, serverIp: '34.1.2.3', currentDomain: null, request: null, controlDirReady: true, webhookBaseUrl: null });
    expect(info.status).toMatchObject({ state: 'applied', domain: 'a.duckdns.org' });

    await fsp.writeFile(path.join(dir, STATUS_FILE), '{lixo');
    expect((await getDomainInfo()).status).toBeNull();

    process.env.PUBLIC_URL = 'https://a.duckdns.org/';
    const https = await getDomainInfo();
    expect(https).toMatchObject({ isHttps: true, currentDomain: 'a.duckdns.org', webhookBaseUrl: 'https://a.duckdns.org/api/whatsapp/cloud/webhook/' });
  });
});

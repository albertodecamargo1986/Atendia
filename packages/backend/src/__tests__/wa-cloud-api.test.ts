/**
 * API oficial (Cloud API) — funções puras: verificação GET do webhook, assinatura
 * X-Hub-Signature-256, normalização de cada tipo de mensagem, status de entrega,
 * montagem das mensagens, mapeamento dos erros da Graph API e chamadas com fetch falso.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  verifyWebhookChallenge,
  isValidSignature,
  computeSignature,
  normalizeCloudMessage,
  normalizeCloudStatus,
  extractCloudChanges,
  safeEqual,
} from '../lib/wa-cloud-webhook.js';
import {
  CloudApiError,
  CloudNetworkError,
  describeCloudError,
  parseGraphError,
  buildTemplateBody,
  buildTextBody,
  buildMediaBody,
  sendCloudMessage,
  markCloudRead,
  listCloudTemplates,
  parseTemplate,
  downloadCloudMedia,
  uploadCloudMedia,
  getCloudPhoneNumberInfo,
  toCloudRecipient,
  GRAPH_API_VERSION,
  CLOUD_RESTRICTION_RULES,
} from '../lib/wa-cloud-api.js';
import { extractMessageText, getMediaInfo } from '../lib/wa-message.js';
import { tierDailyQuota, resolveTemplateParams, renderTemplateBody } from '../lib/wa-cloud-campaign.js';
import { isInsideCustomerWindow, CLOUD_WINDOW_MS } from '../lib/wa-provider.js';

const creds = { phoneNumberId: '1234567890', accessToken: 'EAAG-token-de-teste-123456', wabaId: '99887766' };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('webhook — verificação GET', () => {
  const q = (over: Record<string, unknown> = {}) => ({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok-123', 'hub.challenge': '98765', ...over });

  it('token certo: devolve o challenge', () => {
    expect(verifyWebhookChallenge(q(), 'tok-123')).toBe('98765');
  });
  it('token errado, modo errado, sem challenge ou sessão sem token: null (403)', () => {
    expect(verifyWebhookChallenge(q({ 'hub.verify_token': 'outro' }), 'tok-123')).toBeNull();
    expect(verifyWebhookChallenge(q({ 'hub.verify_token': 'tok-1234' }), 'tok-123')).toBeNull();
    expect(verifyWebhookChallenge(q({ 'hub.mode': 'unsubscribe' }), 'tok-123')).toBeNull();
    expect(verifyWebhookChallenge(q({ 'hub.challenge': undefined }), 'tok-123')).toBeNull();
    expect(verifyWebhookChallenge(q(), null)).toBeNull();
    expect(verifyWebhookChallenge(q({ 'hub.verify_token': ['tok-123'] }), 'tok-123')).toBeNull();
  });
  it('safeEqual: tamanhos diferentes e vazios são falsos', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});

describe('webhook — assinatura X-Hub-Signature-256', () => {
  const secret = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
  const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));

  it('assinatura válida', () => {
    expect(isValidSignature(raw, computeSignature(raw, secret), secret)).toBe(true);
  });
  it('assinatura inválida (outro segredo / corpo alterado)', () => {
    expect(isValidSignature(raw, computeSignature(raw, 'outro-segredo-qualquer-123456'), secret)).toBe(false);
    expect(isValidSignature(Buffer.from(raw.toString() + ' '), computeSignature(raw, secret), secret)).toBe(false);
  });
  it('tamanho diferente não lança (checagem antes do timingSafeEqual)', () => {
    const sig = computeSignature(raw, secret);
    expect(() => isValidSignature(raw, sig + 'ab', secret)).not.toThrow();
    expect(isValidSignature(raw, sig + 'ab', secret)).toBe(false);
    expect(isValidSignature(raw, sig.slice(0, -2), secret)).toBe(false);
  });
  it('sem cabeçalho, sem prefixo sha256=, sem corpo bruto ou sem App Secret: inválida', () => {
    expect(isValidSignature(raw, undefined, secret)).toBe(false);
    expect(isValidSignature(raw, computeSignature(raw, secret).replace('sha256=', ''), secret)).toBe(false);
    expect(isValidSignature(undefined, computeSignature(raw, secret), secret)).toBe(false);
    expect(isValidSignature(raw, computeSignature(raw, secret), null)).toBe(false);
  });
});

describe('normalização das mensagens recebidas (formato interno compartilhado)', () => {
  const contacts = [{ wa_id: '5511988887777', profile: { name: 'Maria' } }];
  const base = { from: '5511988887777', id: 'wamid.ABC', timestamp: '1790000000' };
  const n = (m: any) => normalizeCloudMessage({ ...base, ...m }, contacts)!;

  it('texto', () => {
    const msg = n({ type: 'text', text: { body: 'Olá' } });
    expect(msg.key).toEqual({ remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'wamid.ABC' });
    expect(msg.pushName).toBe('Maria');
    expect(msg.messageTimestamp).toBe(1790000000);
    expect(extractMessageText(msg)).toBe('Olá');
    expect(getMediaInfo(msg)).toBeNull();
  });
  it('imagem com legenda (mídia a baixar pela Graph API)', () => {
    const msg = n({ type: 'image', image: { id: 'MID1', mime_type: 'image/jpeg', caption: 'foto' } });
    expect(extractMessageText(msg)).toBe('foto');
    expect(getMediaInfo(msg)).toMatchObject({ kind: 'IMAGE', mimetype: 'image/jpeg' });
    expect(msg.cloudMedia).toEqual({ id: 'MID1', mimeType: 'image/jpeg', fileName: undefined });
  });
  it('áudio (mensagem de voz)', () => {
    const msg = n({ type: 'audio', audio: { id: 'MID2', mime_type: 'audio/ogg; codecs=opus', voice: true } });
    expect(extractMessageText(msg)).toBe('[Áudio]');
    expect(getMediaInfo(msg)).toMatchObject({ kind: 'AUDIO' });
    expect(msg.message.audioMessage.ptt).toBe(true);
  });
  it('vídeo', () => {
    const msg = n({ type: 'video', video: { id: 'MID3', mime_type: 'video/mp4' } });
    expect(extractMessageText(msg)).toBe('[Vídeo]');
    expect(getMediaInfo(msg)).toMatchObject({ kind: 'VIDEO' });
  });
  it('documento com nome', () => {
    const msg = n({ type: 'document', document: { id: 'MID4', mime_type: 'application/pdf', filename: 'contrato.pdf' } });
    expect(extractMessageText(msg)).toBe('[Documento: contrato.pdf]');
    expect(getMediaInfo(msg)).toMatchObject({ kind: 'DOCUMENT', fileName: 'contrato.pdf' });
    expect(msg.cloudMedia?.fileName).toBe('contrato.pdf');
  });
  it('figurinha (não é baixada)', () => {
    const msg = n({ type: 'sticker', sticker: { id: 'MID5', mime_type: 'image/webp' } });
    expect(extractMessageText(msg)).toBe('[Figurinha]');
    expect(getMediaInfo(msg)).toMatchObject({ kind: 'STICKER' });
    expect(msg.cloudMedia).toBeUndefined();
  });
  it('botão interativo (button_reply) e lista (list_reply)', () => {
    const b = n({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Sim' } } });
    expect(extractMessageText(b)).toBe('Sim');
    const l = n({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'r1', title: 'Plano Pro' } } });
    expect(extractMessageText(l)).toBe('Plano Pro');
  });
  it('resposta rápida de modelo (type button)', () => {
    const msg = n({ type: 'button', button: { text: 'Quero saber mais', payload: 'MAIS' } });
    expect(extractMessageText(msg)).toBe('Quero saber mais');
  });
  it('localização e contato', () => {
    expect(extractMessageText(n({ type: 'location', location: { latitude: 1, longitude: 2 } }))).toBe('[Localização]');
    expect(extractMessageText(n({ type: 'contacts', contacts: [{ name: { formatted_name: 'João' } }] }))).toBe('[Contato: João]');
  });
  it('reação, sistema e tipos desconhecidos são ignorados (null)', () => {
    expect(normalizeCloudMessage({ ...base, type: 'reaction', reaction: { message_id: 'x', emoji: '👍' } }, contacts)).toBeNull();
    expect(normalizeCloudMessage({ ...base, type: 'system', system: {} }, contacts)).toBeNull();
    expect(normalizeCloudMessage({ ...base, type: 'unsupported' }, contacts)).toBeNull();
    expect(normalizeCloudMessage({ ...base, from: '', type: 'text', text: { body: 'x' } }, contacts)).toBeNull();
  });
  it('status de entrega (sent/delivered/read/failed com erro)', () => {
    expect(normalizeCloudStatus({ id: 'wamid.1', status: 'delivered', timestamp: '1790000001', recipient_id: '5511' }))
      .toMatchObject({ id: 'wamid.1', status: 'delivered', recipientId: '5511', errors: [] });
    expect(normalizeCloudStatus({ id: 'wamid.2', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement', error_data: { details: 'x' } }] })?.errors[0])
      .toMatchObject({ code: 131047, details: 'x' });
    expect(normalizeCloudStatus({ status: 'read' })).toBeNull();
  });
  it('extrai só o campo "messages" de whatsapp_business_account', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [
        { field: 'messages', value: { metadata: { phone_number_id: '111' }, messages: [{ id: 'a' }], contacts: [], statuses: [{ id: 's' }] } },
        { field: 'account_update', value: {} },
      ] }],
    };
    expect(extractCloudChanges(body)).toEqual([{ phoneNumberId: '111', messages: [{ id: 'a' }], contacts: [], statuses: [{ id: 's' }] }]);
    expect(extractCloudChanges({ object: 'page', entry: [] })).toEqual([]);
  });
});

describe('montagem das mensagens', () => {
  it('texto sem prévia de link', () => {
    expect(buildTextBody('5511', 'oi')).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '5511', type: 'text', text: { body: 'oi', preview_url: false },
    });
  });
  it('modelo com variáveis numeradas e nomeadas', () => {
    const pos = buildTemplateBody('5511', { name: 'promo', language: 'pt_BR', bodyParams: ['Maria', '10%'] });
    expect(pos.template).toEqual({
      name: 'promo', language: { code: 'pt_BR' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Maria' }, { type: 'text', text: '10%' }] }],
    });
    const named = buildTemplateBody('5511', { name: 'promo', language: 'pt_BR', bodyParams: ['Maria'], paramNames: ['nome'] });
    expect(named.template.components![0].parameters[0]).toEqual({ type: 'text', parameter_name: 'nome', text: 'Maria' });
    expect(buildTemplateBody('5511', { name: 'hello_world', language: 'en_US' }).template).toEqual({ name: 'hello_world', language: { code: 'en_US' } });
  });
  it('mídia por id (documento com nome; áudio sem legenda)', () => {
    expect(buildMediaBody('5511', 'document', 'M1', { caption: 'c', fileName: 'a.pdf' })).toMatchObject({ type: 'document', document: { id: 'M1', caption: 'c', filename: 'a.pdf' } });
    expect(buildMediaBody('5511', 'audio', 'M2', { caption: 'x' })).toMatchObject({ type: 'audio', audio: { id: 'M2' } });
  });
  it('destinatário: só dígitos; LID não tem telefone', () => {
    expect(toCloudRecipient('5511988887777@s.whatsapp.net')).toBe('5511988887777');
    expect(toCloudRecipient('123456789@lid')).toBeNull();
  });
});

describe('erros da Graph API → português', () => {
  it.each([
    [190, 'auth', /token/i],
    [10, 'permission', /permiss/i],
    [200, 'permission', /permiss/i],
    [131047, 'window', /24h/],
    [131026, 'recipient', /não entregue/i],
    [4, 'rate', /Muitas chamadas/],
    [80007, 'rate', /limitou/],
    [130429, 'rate', /vazão/],
    [131048, 'quality', /spam/],
    [368, 'policy', /bloqueou/],
    [132001, 'template', /modelo/i],
  ])('código %s → %s', (code, kind, text) => {
    const info = describeCloudError(code as number);
    expect(info.kind).toBe(kind);
    expect(info.message).toMatch(text as RegExp);
  });
  it('100/33 = Phone Number ID errado; desconhecido mostra o código', () => {
    expect(describeCloudError(100, 33).kind).toBe('not_found');
    expect(describeCloudError(999999).message).toMatch(/999999/);
  });
  it('erros de qualidade/limite pausam as automações (mesma rotina do 463)', () => {
    for (const code of [131048, 131056, 130429, 80007, 368]) expect(CLOUD_RESTRICTION_RULES[code]).toBeTruthy();
    expect(CLOUD_RESTRICTION_RULES[131048]).toEqual({ pauseMs: 24 * 3600_000, incident: true });
    expect(CLOUD_RESTRICTION_RULES[368].incident).toBe(true);
    expect(CLOUD_RESTRICTION_RULES[130429].incident).toBe(false);
    expect(new CloudApiError(131047, 400, 'x').restriction).toBeNull();
  });
  it('parseGraphError lê code/subcode/detalhes', () => {
    const err = parseGraphError(400, { error: { code: 100, error_subcode: 33, message: 'Unsupported get request', error_data: { details: 'x' } } });
    expect(err).toBeInstanceOf(CloudApiError);
    expect(err.code).toBe(100);
    expect(err.subcode).toBe(33);
    expect(err.kind).toBe('not_found');
    expect(err.details).toContain('Unsupported');
  });
});

describe('chamadas à Graph API (fetch falso)', () => {
  it('envio: POST /{versão}/{phoneNumberId}/messages com Bearer e devolve o wamid', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { messages: [{ id: 'wamid.OUT' }] }));
    const id = await sendCloudMessage(creds, buildTextBody('5511', 'oi'), fetchMock as any);
    expect(id).toBe('wamid.OUT');
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe(`https://graph.facebook.com/${GRAPH_API_VERSION}/1234567890/messages`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${creds.accessToken}`);
    expect(JSON.parse(init.body)).toMatchObject({ to: '5511', type: 'text' });
  });
  it('Meta recusa (HTTP 400): CloudApiError com o código', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, { error: { code: 131047, message: 'Re-engagement message' } }));
    await expect(sendCloudMessage(creds, buildTextBody('5511', 'oi'), fetchMock as any)).rejects.toMatchObject({ code: 131047, kind: 'window' });
  });
  it('sem resposta (rede): CloudNetworkError (pode ter saído)', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(sendCloudMessage(creds, buildTextBody('5511', 'oi'), fetchMock as any)).rejects.toBeInstanceOf(CloudNetworkError);
  });
  it('"visto" + "digitando...": se a Meta recusar o typing, cai para só "lido"', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(400, { error: { code: 100, message: 'typing_indicator not supported' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }));
    expect(await markCloudRead(creds, 'wamid.IN', true, fetchMock as any)).toBe('read');
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toMatchObject({ status: 'read', message_id: 'wamid.IN', typing_indicator: { type: 'text' } });
    expect(JSON.parse((fetchMock.mock.calls[1] as any)[1].body)).toEqual({ messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.IN' });
  });
  it('testar conexão: nome verificado, qualidade e tier', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {
      display_phone_number: '+55 11 98888-7777', verified_name: 'Loja X', quality_rating: 'GREEN', messaging_limit_tier: 'TIER_1K',
    }));
    const info = await getCloudPhoneNumberInfo(creds, fetchMock as any);
    expect(info).toMatchObject({ verifiedName: 'Loja X', qualityRating: 'GREEN', messagingLimitTier: 'TIER_1K' });
    expect((fetchMock.mock.calls[0] as any)[0]).toContain('/1234567890?fields=');
  });
  it('modelos: lê variáveis e marca os que o sistema não envia', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: [
      { name: 'boas_vindas', language: 'pt_BR', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'Olá {{1}}, seu pedido {{2}} saiu.' }] },
      { name: 'com_foto', language: 'pt_BR', status: 'APPROVED', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Oi' }] },
      { name: 'nomeado', language: 'pt_BR', status: 'APPROVED', parameter_format: 'NAMED', components: [{ type: 'BODY', text: 'Oi {{nome}}' }] },
    ] }));
    const list = await listCloudTemplates(creds, fetchMock as any);
    expect((fetchMock.mock.calls[0] as any)[0]).toContain('/99887766/message_templates');
    expect(list[0]).toMatchObject({ name: 'boas_vindas', variables: ['1', '2'], named: false, supported: true });
    expect(list[1].supported).toBe(false);
    expect(list[2]).toMatchObject({ variables: ['nome'], named: true });
    expect(parseTemplate({ name: 'x', components: [{ type: 'BUTTONS', buttons: [{ type: 'URL', url: 'https://a.com/{{1}}' }] }] }).supported).toBe(false);
  });
  it('mídia recebida: respeita o limite de 16 MB', async () => {
    const big = vi.fn(async () => jsonResponse(200, { url: 'https://lookaside.fbsbx.com/x', file_size: 20 * 1024 * 1024 }));
    expect(await downloadCloudMedia(creds, 'MID', big as any)).toBeNull();
    const ok = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { url: 'https://lookaside.fbsbx.com/x', mime_type: 'image/jpeg', file_size: 3 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const media = await downloadCloudMedia(creds, 'MID', ok as any);
    expect(media?.buffer.length).toBe(3);
    expect((ok.mock.calls[1] as any)[1].headers.Authorization).toBe(`Bearer ${creds.accessToken}`);
  });
  it('upload de mídia: multipart com FormData nativo', async () => {
    const file = path.join(os.tmpdir(), `cloud-up-${process.pid}.pdf`);
    fs.writeFileSync(file, 'pdf');
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: 'MEDIA9' }));
    expect(await uploadCloudMedia(creds, file, undefined, fetchMock as any)).toBe('MEDIA9');
    const init = (fetchMock.mock.calls[0] as any)[1];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('type')).toBe('application/pdf');
    expect((init.body as FormData).get('messaging_product')).toBe('whatsapp');
    fs.rmSync(file, { force: true });
  });
});

describe('janela de 24 h, cota pelo tier e variáveis da campanha', () => {
  it('janela: aberta até 24 h depois da última mensagem do cliente', () => {
    const now = Date.now();
    expect(isInsideCustomerWindow(new Date(now - 1000), now)).toBe(true);
    expect(isInsideCustomerWindow(new Date(now - CLOUD_WINDOW_MS - 1), now)).toBe(false);
    expect(isInsideCustomerWindow(null, now)).toBe(false);
  });
  it('cota diária pelo tier (desconhecido = 250)', () => {
    expect(tierDailyQuota('TIER_1K')).toBe(1000);
    expect(tierDailyQuota(null)).toBe(250);
  });
  it('variáveis: {nome} vira o primeiro nome (sem nome → "cliente"); texto fixo mantido', () => {
    const mapping = [{ name: '1', value: '{nome}' }, { name: '2', value: 'PROMO10' }];
    expect(resolveTemplateParams(mapping, { name: 'maria silva' })).toEqual({ values: ['Maria', 'PROMO10'], names: null });
    expect(resolveTemplateParams(mapping, { name: '5511999' }).values[0]).toBe('cliente');
    expect(resolveTemplateParams([{ name: 'nome', value: '{nome}' }], { name: 'Ana' }).names).toEqual(['nome']);
    expect(renderTemplateBody('Olá {{1}}, cupom {{ 2 }}', mapping, ['Maria', 'PROMO10'])).toBe('Olá Maria, cupom PROMO10');
  });
});

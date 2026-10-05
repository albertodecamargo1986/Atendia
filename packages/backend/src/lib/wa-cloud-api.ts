/**
 * Cliente da API oficial do WhatsApp (Cloud API / Graph API da Meta) — sem dependências
 * (fetch e FormData nativos do Node 22). Funções puras: credenciais e fetch são parâmetros.
 *
 * Erros: a Meta respondeu com erro (HTTP 4xx/5xx com corpo de erro) → CloudApiError (a mensagem
 * NÃO saiu); falha de rede/tempo esgotado → CloudNetworkError (pode ter saído — não repetir).
 */
import fs from 'fs/promises';
import path from 'path';

/** Versão fixa da Graph API (troque aqui quando migrar de versão). */
export const GRAPH_API_VERSION = 'v21.0';
export const GRAPH_BASE_URL = 'https://graph.facebook.com';
/** Tempo máximo de uma chamada (abaixo do limite da fila do número, 120 s). */
export const GRAPH_TIMEOUT_MS = 30_000;
/** Mídia recebida: mesmo limite do caminho QR Code (16 MB). */
export const CLOUD_MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export type FetchLike = typeof fetch;

export interface CloudCreds {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string | null;
}

export type CloudErrorKind =
  | 'auth' | 'permission' | 'not_found' | 'window' | 'rate' | 'quality' | 'policy'
  | 'recipient' | 'template' | 'media' | 'payment' | 'invalid' | 'unknown';

export interface RestrictionRule {
  /** Pausa das automações do número (mesma rotina de restrição do QR Code). */
  pauseMs: number;
  /** Conta como incidente (2 em 30 dias desligam as campanhas do número). */
  incident: boolean;
}

/** Erros de qualidade/limite da Meta que pausam as automações do número. */
export const CLOUD_RESTRICTION_RULES: Record<number, RestrictionRule> = {
  131048: { pauseMs: 24 * 3600_000, incident: true },  // limite por spam (qualidade)
  368: { pauseMs: 24 * 3600_000, incident: true },     // bloqueado temporariamente por política
  131031: { pauseMs: 24 * 3600_000, incident: true },  // conta bloqueada
  131056: { pauseMs: 3600_000, incident: false },      // muitas mensagens para o mesmo contato
  130429: { pauseMs: 3600_000, incident: false },      // vazão (throughput) da Cloud API
  80007: { pauseMs: 3600_000, incident: false },       // limite de taxa da conta (WABA)
};

interface ErrorInfo { kind: CloudErrorKind; message: string }

const ERROR_TEXT: Record<number, ErrorInfo> = {
  190: { kind: 'auth', message: 'O token de acesso da Meta é inválido ou expirou. Gere um token permanente (usuário do sistema) e salve de novo.' },
  10: { kind: 'permission', message: 'O token não tem permissão para este número. Dê as permissões whatsapp_business_messaging e whatsapp_business_management ao usuário do sistema.' },
  4: { kind: 'rate', message: 'Muitas chamadas à API da Meta em pouco tempo. Aguarde alguns minutos.' },
  80007: { kind: 'rate', message: 'A Meta limitou a quantidade de mensagens da sua conta agora. Os envios automáticos foram pausados por 1 hora.' },
  130429: { kind: 'rate', message: 'Limite de vazão da API da Meta atingido. Os envios automáticos foram pausados por 1 hora.' },
  131056: { kind: 'rate', message: 'Muitas mensagens para o mesmo contato em pouco tempo. Os envios automáticos foram pausados por 1 hora.' },
  131048: { kind: 'quality', message: 'A Meta limitou este número por possível spam (muitas denúncias/bloqueios). Envios automáticos pausados por 24 horas.' },
  368: { kind: 'policy', message: 'A Meta bloqueou temporariamente este número por violar as políticas. Envios automáticos pausados por 24 horas.' },
  131031: { kind: 'policy', message: 'A conta do WhatsApp Business foi bloqueada pela Meta. Verifique o Gerenciador do WhatsApp.' },
  131047: { kind: 'window', message: 'Fora da janela de 24h — o cliente não fala com você há mais de 24 horas. Use um modelo aprovado.' },
  131026: { kind: 'recipient', message: 'Mensagem não entregue: o número pode não ter WhatsApp ou ainda não aceitou os termos atuais do WhatsApp.' },
  131030: { kind: 'recipient', message: 'Número de teste: adicione este destinatário na lista de números permitidos no painel da Meta.' },
  131049: { kind: 'recipient', message: 'A Meta decidiu não entregar esta mensagem de marketing agora (limite por contato). Tente mais tarde.' },
  130472: { kind: 'recipient', message: 'A Meta não entregou esta mensagem para este contato (experimento da Meta).' },
  131021: { kind: 'recipient', message: 'O destinatário não pode ser o próprio número que envia.' },
  133010: { kind: 'not_found', message: 'Este número ainda não está registrado na API oficial. Conclua o registro no painel da Meta.' },
  131042: { kind: 'payment', message: 'Há um problema de pagamento na conta da Meta. Verifique a forma de pagamento no Gerenciador de Negócios.' },
  131051: { kind: 'invalid', message: 'Tipo de mensagem não suportado pela API oficial.' },
  131052: { kind: 'media', message: 'Não foi possível baixar a mídia enviada pelo cliente.' },
  131053: { kind: 'media', message: 'Não foi possível enviar o arquivo: formato ou tamanho não aceito pela Meta.' },
  131008: { kind: 'invalid', message: 'Faltou um dado obrigatório na mensagem.' },
  131009: { kind: 'invalid', message: 'Um dos dados da mensagem é inválido.' },
  132000: { kind: 'template', message: 'O número de variáveis não confere com o modelo aprovado.' },
  132001: { kind: 'template', message: 'O modelo não existe nesse idioma ou ainda não foi aprovado.' },
  132005: { kind: 'template', message: 'O texto do modelo ficou grande demais com as variáveis preenchidas.' },
  132007: { kind: 'template', message: 'O conteúdo do modelo viola as políticas da Meta.' },
  132012: { kind: 'template', message: 'As variáveis do modelo estão no formato errado.' },
  132015: { kind: 'template', message: 'O modelo foi pausado pela Meta por baixa qualidade.' },
  132016: { kind: 'template', message: 'O modelo foi desativado pela Meta.' },
};

/** Texto em português (leigo) para um código de erro da Graph API. */
export function describeCloudError(code: number | null | undefined, subcode?: number | null): ErrorInfo {
  if (code == null) return { kind: 'unknown', message: 'Erro desconhecido na API da Meta.' };
  if (ERROR_TEXT[code]) return ERROR_TEXT[code];
  if (code >= 200 && code <= 299) return ERROR_TEXT[10];
  if (code === 100 && subcode === 33) {
    return { kind: 'not_found', message: 'Phone Number ID não encontrado ou o token não tem acesso a ele. Confira os dados no painel da Meta.' };
  }
  if (code === 100) return { kind: 'invalid', message: 'Algum dado enviado à Meta é inválido. Confira o Phone Number ID, o WABA ID e o número do destinatário.' };
  if (code === 131000 || code === 131016 || code === 1 || code === 2) {
    return { kind: 'unknown', message: 'A API da Meta está instável no momento. Tente de novo em alguns minutos.' };
  }
  return { kind: 'unknown', message: `A Meta recusou a operação (código ${code}).` };
}

export class CloudApiError extends Error {
  readonly cloudApi = true;
  readonly kind: CloudErrorKind;
  readonly userMessage: string;
  readonly restriction: RestrictionRule | null;
  constructor(
    readonly code: number | null,
    readonly httpStatus: number,
    readonly details: string,
    readonly subcode: number | null = null,
  ) {
    const info = describeCloudError(code, subcode);
    super(info.message);
    this.kind = info.kind;
    this.userMessage = info.message;
    this.restriction = code != null ? CLOUD_RESTRICTION_RULES[code] ?? null : null;
  }
}

/** Sem resposta da Meta (rede/tempo esgotado): a mensagem PODE ter saído. */
export class CloudNetworkError extends Error {
  readonly cloudNetwork = true;
}

/** Converte o corpo de erro da Graph API em CloudApiError. */
export function parseGraphError(httpStatus: number, body: any): CloudApiError {
  const err = body?.error ?? {};
  const code = typeof err.code === 'number' ? err.code : err.code != null ? Number(err.code) : null;
  const subcode = typeof err.error_subcode === 'number' ? err.error_subcode : null;
  const details = [err.message, err.error_data?.details].filter(Boolean).join(' — ') || `HTTP ${httpStatus}`;
  return new CloudApiError(Number.isFinite(code as number) ? code : null, httpStatus, details, subcode);
}

function graphUrl(p: string) {
  return `${GRAPH_BASE_URL}/${GRAPH_API_VERSION}/${p.replace(/^\/+/, '')}`;
}

async function graphRequest(
  token: string,
  method: 'GET' | 'POST',
  p: string,
  body?: Record<string, unknown> | FormData,
  fetchImpl: FetchLike = fetch,
): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetchImpl(p.startsWith('http') ? p : graphUrl(p), {
      method, headers, body: payload, signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
  } catch (err: any) {
    throw new CloudNetworkError(`Sem resposta da API da Meta: ${err?.message || 'erro de rede'}`);
  }
  let json: any = null;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok || json?.error) throw parseGraphError(res.status, json);
  return json;
}

/** Telefone (só dígitos) para o campo `to` da Cloud API. */
export function toCloudRecipient(jidOrPhone: string): string | null {
  const user = String(jidOrPhone || '').split('@')[0].split(':')[0];
  if (String(jidOrPhone).endsWith('@lid')) return null;
  const digits = user.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

// ─── Montagem das mensagens ─────────────────────────────────────────────────

export function buildTextBody(to: string, text: string) {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text, preview_url: false } };
}

export interface TemplateSend {
  name: string;
  language: string;
  /** Valores das variáveis do corpo, na ordem ({{1}}, {{2}}...). */
  bodyParams?: string[];
  /** Nomes das variáveis quando o modelo usa variáveis nomeadas ({{nome}}). */
  paramNames?: string[] | null;
}

export function buildTemplateBody(to: string, t: TemplateSend) {
  const params = (t.bodyParams ?? []).map((text, i) => ({
    type: 'text',
    ...(t.paramNames?.[i] ? { parameter_name: t.paramNames[i] } : {}),
    text: String(text ?? '').slice(0, 1024) || '-',
  }));
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: t.name,
      language: { code: t.language },
      ...(params.length ? { components: [{ type: 'body', parameters: params }] } : {}),
    },
  };
}

export type CloudMediaType = 'image' | 'video' | 'audio' | 'document';

export function buildMediaBody(to: string, type: CloudMediaType, mediaId: string, opts: { caption?: string; fileName?: string } = {}) {
  const media: Record<string, unknown> = { id: mediaId };
  if (opts.caption && type !== 'audio') media.caption = opts.caption;
  if (type === 'document' && opts.fileName) media.filename = opts.fileName;
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type, [type]: media };
}

// ─── Chamadas ───────────────────────────────────────────────────────────────

/** Envia uma mensagem; devolve o id (wamid) da Meta. */
export async function sendCloudMessage(creds: CloudCreds, body: Record<string, unknown>, fetchImpl: FetchLike = fetch): Promise<string> {
  const json = await graphRequest(creds.accessToken, 'POST', `${creds.phoneNumberId}/messages`, body, fetchImpl);
  const id = json?.messages?.[0]?.id;
  if (!id) throw new CloudNetworkError('A Meta não devolveu o id da mensagem');
  return id;
}

/** Marca a mensagem do cliente como lida (+ "digitando..." quando disponível; senão só "lido"). */
export async function markCloudRead(creds: CloudCreds, messageId: string, typing: boolean, fetchImpl: FetchLike = fetch) {
  const base = { messaging_product: 'whatsapp', status: 'read', message_id: messageId };
  if (typing) {
    try {
      await graphRequest(creds.accessToken, 'POST', `${creds.phoneNumberId}/messages`, { ...base, typing_indicator: { type: 'text' } }, fetchImpl);
      return 'typing' as const;
    } catch (err) {
      if (err instanceof CloudNetworkError) throw err;
      // Versão/conta sem "digitando...": cai para só "lido"
    }
  }
  await graphRequest(creds.accessToken, 'POST', `${creds.phoneNumberId}/messages`, base, fetchImpl);
  return 'read' as const;
}

const UPLOAD_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.3gp': 'video/3gpp',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.amr': 'audio/amr',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function guessUploadMime(filePath: string, fallback?: string): string {
  return UPLOAD_MIME[path.extname(filePath).toLowerCase()] || fallback || 'application/octet-stream';
}

/** Sobe um arquivo local para a Meta (POST /{phoneNumberId}/media); devolve o id da mídia. */
export async function uploadCloudMedia(creds: CloudCreds, filePath: string, mimetype?: string, fetchImpl: FetchLike = fetch): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const type = (mimetype || guessUploadMime(filePath)).split(';')[0].trim();
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', type);
  form.append('file', new Blob([buffer], { type }), path.basename(filePath));
  const json = await graphRequest(creds.accessToken, 'POST', `${creds.phoneNumberId}/media`, form, fetchImpl);
  if (!json?.id) throw new CloudApiError(null, 200, 'A Meta não devolveu o id da mídia');
  return json.id;
}

export interface PhoneNumberInfo {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  codeVerificationStatus: string | null;
  nameStatus: string | null;
}

/** "Testar conexão": dados do número na Meta (nome verificado, qualidade, tier). */
export async function getCloudPhoneNumberInfo(creds: CloudCreds, fetchImpl: FetchLike = fetch): Promise<PhoneNumberInfo> {
  const fields = 'display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status,name_status';
  const json = await graphRequest(creds.accessToken, 'GET', `${creds.phoneNumberId}?fields=${fields}`, undefined, fetchImpl);
  return {
    displayPhoneNumber: json?.display_phone_number ?? null,
    verifiedName: json?.verified_name ?? null,
    qualityRating: json?.quality_rating ?? null,
    messagingLimitTier: json?.messaging_limit_tier ?? null,
    codeVerificationStatus: json?.code_verification_status ?? null,
    nameStatus: json?.name_status ?? null,
  };
}

export interface CloudTemplate {
  name: string;
  language: string;
  category: string | null;
  status: string;
  /** Texto do corpo (com {{1}}...). */
  body: string;
  /** Variáveis do corpo, na ordem em que aparecem. */
  variables: string[];
  /** Variáveis nomeadas ({{nome}}) em vez de numeradas. */
  named: boolean;
  /** false = precisa de algo que o sistema ainda não envia (cabeçalho com mídia/variável, botão com variável). */
  supported: boolean;
}

/** Variáveis {{1}} / {{nome}} do texto, sem repetir, na ordem. */
export function templateVariables(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text || '').matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export function parseTemplate(raw: any): CloudTemplate {
  const components: any[] = Array.isArray(raw?.components) ? raw.components : [];
  const body = components.find((c) => c?.type === 'BODY')?.text || '';
  const header = components.find((c) => c?.type === 'HEADER');
  const buttons = components.find((c) => c?.type === 'BUTTONS')?.buttons || [];
  const variables = templateVariables(body);
  const named = variables.some((v) => !/^\d+$/.test(v)) || raw?.parameter_format === 'NAMED';
  let supported = true;
  if (header && header.format && header.format !== 'TEXT') supported = false;
  if (header?.format === 'TEXT' && templateVariables(header.text).length) supported = false;
  if (buttons.some((b: any) => (b?.type === 'URL' && /\{\{/.test(b?.url || '')) || b?.type === 'COPY_CODE' || b?.type === 'FLOW')) supported = false;
  return {
    name: String(raw?.name || ''),
    language: String(raw?.language || ''),
    category: raw?.category ?? null,
    status: String(raw?.status || ''),
    body,
    variables,
    named,
    supported,
  };
}

/** Modelos da conta (WABA). Só os APROVADOS interessam para envio. */
export async function listCloudTemplates(creds: CloudCreds, fetchImpl: FetchLike = fetch): Promise<CloudTemplate[]> {
  if (!creds.wabaId) throw new CloudApiError(100, 400, 'WABA ID não informado');
  const out: CloudTemplate[] = [];
  let next: string | null = `${creds.wabaId}/message_templates?fields=name,language,status,category,components,parameter_format&limit=100`;
  for (let page = 0; next && page < 10; page++) {
    const json: any = await graphRequest(creds.accessToken, 'GET', next, undefined, fetchImpl);
    for (const t of json?.data || []) out.push(parseTemplate(t));
    next = typeof json?.paging?.next === 'string' ? json.paging.next : null;
  }
  return out;
}

/**
 * Mídia recebida: GET /{media-id} → url temporária → download com o token.
 * Devolve null se passar do limite (16 MB).
 */
export async function downloadCloudMedia(
  creds: CloudCreds,
  mediaId: string,
  fetchImpl: FetchLike = fetch,
  maxBytes = CLOUD_MAX_MEDIA_BYTES,
): Promise<{ buffer: Buffer; mimeType: string | null } | null> {
  const meta = await graphRequest(creds.accessToken, 'GET', mediaId, undefined, fetchImpl);
  if (meta?.file_size && Number(meta.file_size) > maxBytes) return null;
  if (!meta?.url) return null;
  let res: Response;
  try {
    res = await fetchImpl(meta.url, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
  } catch (err: any) {
    throw new CloudNetworkError(`Falha ao baixar mídia: ${err?.message || 'erro de rede'}`);
  }
  if (!res.ok) throw new CloudApiError(131052, res.status, `Download da mídia: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0 || buffer.length > maxBytes) return null;
  return { buffer, mimeType: meta.mime_type ?? null };
}

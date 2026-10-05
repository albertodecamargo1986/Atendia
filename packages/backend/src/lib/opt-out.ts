/**
 * Opt-out de mensagens automáticas (campanhas).
 * A mensagem inteira, normalizada (sem acento, maiúscula, espaços simples, sem pontuação nas
 * pontas), precisa ser exatamente uma das expressões abaixo.
 * "CANCELAR" NÃO é opt-out: o cliente pode estar querendo cancelar um pedido.
 */
export const OPT_OUT_KEYWORDS = [
  'SAIR', 'PARAR', 'PARE', 'STOP', 'DESCADASTRAR', 'REMOVER', 'NAO QUERO MAIS', 'DESINSCREVER',
] as const;

export const OPT_OUT_REPLY = 'Pronto, você não receberá mais mensagens automáticas.';

export function normalizeOptOutText(text: string | null | undefined): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '')
    .replace(/\s+/g, ' ');
}

export function isOptOutMessage(text: string | null | undefined): boolean {
  const normalized = normalizeOptOutText(text);
  return (OPT_OUT_KEYWORDS as readonly string[]).includes(normalized);
}

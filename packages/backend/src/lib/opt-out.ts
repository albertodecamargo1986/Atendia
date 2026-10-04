/**
 * Opt-out de mensagens automáticas (campanhas).
 * A mensagem inteira, normalizada (sem acento, maiúscula, sem espaços/pontuação nas pontas),
 * precisa ser exatamente uma das palavras abaixo — "quero cancelar o pedido" NÃO é opt-out.
 */
export const OPT_OUT_KEYWORDS = ['SAIR', 'PARAR', 'STOP', 'CANCELAR', 'DESCADASTRAR'] as const;

export const OPT_OUT_REPLY = 'Pronto, você não receberá mais mensagens automáticas.';

export function normalizeOptOutText(text: string | null | undefined): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '');
}

export function isOptOutMessage(text: string | null | undefined): boolean {
  const normalized = normalizeOptOutText(text);
  return (OPT_OUT_KEYWORDS as readonly string[]).includes(normalized);
}

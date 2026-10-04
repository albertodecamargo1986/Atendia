/**
 * Personalização de mensagens de campanha.
 *  - {nome}  → primeiro nome do contato (vazio se o "nome" for só o telefone)
 *  - {Olá|Oi|Bom dia} → uma das opções, sorteada por destinatário (spintax; aceita aninhamento)
 * Variar o texto entre destinatários reduz o padrão "mensagem idêntica em massa".
 */

const NAME_PLACEHOLDER = /\{\s*(nome|primeiro_nome|first_name)\s*\}/gi;
const INNER_SPIN = /\{([^{}]*\|[^{}]*)\}/;

/** Primeiro nome "apresentável" (sem números/telefone). */
export function firstName(name: string | null | undefined): string {
  const value = String(name ?? '').trim();
  if (!value || /^[+\d\s()-]+$/.test(value)) return '';
  const first = value.split(/\s+/)[0] || '';
  if (/\d/.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Resolve o spintax {a|b|c} (de dentro para fora). Chaves sem "|" ficam intactas. */
export function applySpintax(text: string, random: () => number = Math.random): string {
  let out = text;
  for (let guard = 0; guard < 200; guard++) {
    const m = INNER_SPIN.exec(out);
    if (!m) break;
    const options = m[1].split('|');
    const pick = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
    out = out.slice(0, m.index) + pick + out.slice(m.index + m[0].length);
  }
  return out;
}

/** Aplica {nome} e spintax e arruma espaços que sobram quando não há nome. */
export function personalizeMessage(
  template: string,
  contact: { name?: string | null },
  random: () => number = Math.random,
): string {
  const name = firstName(contact.name);
  let text = template.replace(NAME_PLACEHOLDER, name);
  text = applySpintax(text, random);
  if (!name) {
    text = text
      .replace(/[ \t]+([,.!?;:])/g, '$1') // "Olá , tudo bem" → "Olá, tudo bem"
      .replace(/([,])(?=[,.!?])/g, '');
  }
  return text.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '').trim();
}

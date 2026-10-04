/** Sufixo correto de JID de contato individual no WhatsApp. */
export const WHATSAPP_USER_SUFFIX = '@s.whatsapp.net';
/** Sufixo de JID com identidade oculta (LID) — NÃO é número de telefone. */
export const WHATSAPP_LID_SUFFIX = '@lid';

/**
 * Converte um telefone (ou JID) no JID de usuário do WhatsApp.
 * - Se já vier um JID (contém "@"), devolve como está (inclusive @lid, que é endereço válido de envio).
 * - Remove tudo que não for dígito do telefone.
 * - Nunca monta "<lid>@s.whatsapp.net": um LID não é número de telefone.
 */
export function toWhatsAppJid(phoneOrJid: string): string {
  const value = (phoneOrJid || '').trim();
  if (value.includes('@')) return value;
  const digits = value.replace(/\D/g, '');
  return `${digits}${WHATSAPP_USER_SUFFIX}`;
}

/** true para JIDs de grupo (a IA não responde em grupos). */
export function isGroupJid(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith('@g.us');
}

/** true para JIDs @lid (identidade oculta). */
export function isLidJid(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith(WHATSAPP_LID_SUFFIX);
}

/** Status, broadcast, newsletter (canais) e grupos: nunca atendidos pela IA. */
export function isIgnoredJid(jid: string | null | undefined): boolean {
  if (!jid) return true;
  return (
    jid === 'status@broadcast' ||
    jid.endsWith('@broadcast') ||
    jid.endsWith('@newsletter') ||
    isGroupJid(jid)
  );
}

/**
 * Telefone (só dígitos) de um JID de usuário ("5511...:12@s.whatsapp.net" → "5511...").
 * Devolve null para @lid, grupos e valores vazios.
 */
export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  if (isLidJid(jid) || isGroupJid(jid)) return null;
  const user = jid.split('@')[0].split(':')[0];
  const digits = user.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

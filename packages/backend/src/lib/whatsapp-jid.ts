/** Sufixo correto de JID de contato individual no WhatsApp. */
export const WHATSAPP_USER_SUFFIX = '@s.whatsapp.net';

/**
 * Converte um telefone (ou JID) no JID de usuário do WhatsApp.
 * - Se já vier um JID (contém "@"), devolve como está.
 * - Remove tudo que não for dígito do telefone.
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

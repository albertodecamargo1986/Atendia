import { describe, it, expect } from 'vitest';
import { applySpintax, personalizeMessage, firstName } from '../lib/spintax.js';
import { isOptOutMessage, normalizeOptOutText } from '../lib/opt-out.js';
import { extractMessageText, getMediaInfo, isFreshMessage, resolveSender } from '../lib/wa-message.js';
import { toWhatsAppJid, phoneFromJid, isIgnoredJid, isLidJid } from '../lib/whatsapp-jid.js';
import { isOpenAt } from '../services/business-hours.service.js';

describe('opt-out — normalização (sem acento, maiúscula, trim)', () => {
  it('aceita SAIR, PARAR, STOP, CANCELAR, DESCADASTRAR em qualquer forma', () => {
    for (const t of ['sair', ' Sair ', 'PARAR', 'Párar', 'Stop!', 'cancelar.', 'Descadastrar', 'DESCADASTRAR ']) {
      expect(isOptOutMessage(t)).toBe(true);
    }
  });

  it('frases e outras palavras NÃO são opt-out', () => {
    for (const t of ['quero cancelar o pedido', 'sair amanhã', 'oi', '', null, undefined, 'parar de receber?']) {
      expect(isOptOutMessage(t as any)).toBe(false);
    }
  });

  it('normaliza acento e caixa', () => {
    expect(normalizeOptOutText('  pára  ')).toBe('PARA');
    expect(normalizeOptOutText('Descadastrár')).toBe('DESCADASTRAR');
  });
});

describe('spintax e {nome}', () => {
  it('{nome} vira o primeiro nome', () => {
    expect(personalizeMessage('Olá {nome}, tudo bem?', { name: 'maria da silva' }, () => 0)).toBe('Olá Maria, tudo bem?');
    expect(personalizeMessage('Oi {NOME}!', { name: 'João' }, () => 0)).toBe('Oi João!');
  });

  it('sem nome (só telefone): remove o placeholder sem deixar espaço sobrando', () => {
    expect(personalizeMessage('Olá {nome}, tudo bem?', { name: '5511999998888' }, () => 0)).toBe('Olá, tudo bem?');
    expect(firstName('+55 11 99999-8888')).toBe('');
  });

  it('spintax escolhe uma opção (inclusive aninhada) e mantém chaves sem "|"', () => {
    expect(applySpintax('{Olá|Oi|Bom dia}', () => 0)).toBe('Olá');
    expect(applySpintax('{Olá|Oi|Bom dia}', () => 0.99)).toBe('Bom dia');
    expect(applySpintax('{Oi|{Bom dia|Boa tarde}} amigo', () => 0.99)).toBe('Boa tarde amigo');
    expect(applySpintax('preço {valor}', () => 0)).toBe('preço {valor}');
  });

  it('combina spintax e nome', () => {
    expect(personalizeMessage('{Olá|Oi} {nome}!', { name: 'Ana' }, () => 0.9)).toBe('Oi Ana!');
  });
});

describe('leitura de mensagens recebidas (normalizeMessageContent)', () => {
  it('desembrulha efêmera, viewOnce e documentWithCaption', () => {
    expect(extractMessageText({ message: { ephemeralMessage: { message: { conversation: 'oi efêmero' } } } })).toBe('oi efêmero');
    expect(extractMessageText({ message: { viewOnceMessageV2: { message: { imageMessage: { caption: 'foto' } } } } })).toBe('foto');
    expect(extractMessageText({
      message: { documentWithCaptionMessage: { message: { documentMessage: { caption: 'segue o pdf', fileName: 'a.pdf' } } } },
    })).toBe('segue o pdf');
  });

  it('respostas de botão e lista', () => {
    expect(extractMessageText({ message: { buttonsResponseMessage: { selectedDisplayText: 'Sim' } } })).toBe('Sim');
    expect(extractMessageText({ message: { listResponseMessage: { title: 'Opção 2' } } })).toBe('Opção 2');
    expect(extractMessageText({ message: { templateButtonReplyMessage: { selectedDisplayText: 'Quero' } } })).toBe('Quero');
  });

  it('mídia sem legenda vira rótulo; reação/protocolo não tem texto', () => {
    expect(extractMessageText({ message: { audioMessage: { mimetype: 'audio/ogg' } } })).toBe('[Áudio]');
    expect(getMediaInfo({ message: { audioMessage: { mimetype: 'audio/ogg', fileLength: 1234 } } })).toMatchObject({ kind: 'AUDIO', fileLength: 1234 });
    expect(extractMessageText({ message: { reactionMessage: { text: '👍' } } })).toBeNull();
  });

  it('mensagens com mais de 10 min não são "recentes"', () => {
    const now = 1_800_000_000_000;
    expect(isFreshMessage({ messageTimestamp: now / 1000 - 30 }, now)).toBe(true);
    expect(isFreshMessage({ messageTimestamp: now / 1000 - 601 }, now)).toBe(false);
    expect(isFreshMessage({ messageTimestamp: { toString: () => String(now / 1000 - 700) } }, now)).toBe(false);
  });
});

describe('LID e JIDs', () => {
  it('@lid usa senderPn como telefone e guarda o LID', () => {
    const s = resolveSender({ key: { remoteJid: '123456789@lid', senderPn: '5511988887777@s.whatsapp.net' } });
    expect(s).toEqual({ phone: '5511988887777', lid: '123456789@lid', replyJid: '5511988887777@s.whatsapp.net' });
  });

  it('@lid sem senderPn: telefone desconhecido, responde para o próprio LID', () => {
    expect(resolveSender({ key: { remoteJid: '123456789@lid' } })).toEqual({ phone: null, lid: '123456789@lid', replyJid: '123456789@lid' });
  });

  it('toWhatsAppJid nunca transforma LID em número; phoneFromJid ignora LID/grupo', () => {
    expect(toWhatsAppJid('123@lid')).toBe('123@lid');
    expect(isLidJid('123@lid')).toBe(true);
    expect(phoneFromJid('123@lid')).toBeNull();
    expect(phoneFromJid('5511988887777:12@s.whatsapp.net')).toBe('5511988887777');
    expect(phoneFromJid('12036302@g.us')).toBeNull();
  });

  it('ignora grupos, status, broadcast e canais', () => {
    for (const jid of ['status@broadcast', '123@broadcast', '123@newsletter', '123-456@g.us', '']) {
      expect(isIgnoredJid(jid)).toBe(true);
    }
    expect(isIgnoredJid('5511988887777@s.whatsapp.net')).toBe(false);
  });
});

describe('horário comercial no fuso America/Sao_Paulo (Intl)', () => {
  const hours = [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, isOpen: true, openTime: '08:00', closeTime: '18:00' }));

  it('usa a hora de Brasília, não a do servidor', () => {
    // 10:30 UTC = 07:30 em SP (fechado); 11:30 UTC = 08:30 em SP (aberto)
    expect(isOpenAt(hours, new Date('2026-10-05T10:30:00Z'))).toBe(false);
    expect(isOpenAt(hours, new Date('2026-10-05T11:30:00Z'))).toBe(true);
    // 22:00 UTC = 19:00 em SP (fechado)
    expect(isOpenAt(hours, new Date('2026-10-05T22:00:00Z'))).toBe(false);
    // Domingo sem configuração: fechado
    expect(isOpenAt(hours, new Date('2026-10-04T15:00:00Z'))).toBe(false);
  });

  it('sem configuração = sempre aberto; 00:00–23:59 = dia todo', () => {
    expect(isOpenAt([], new Date())).toBe(true);
    expect(isOpenAt([{ dayOfWeek: 0, isOpen: true, openTime: '00:00', closeTime: '23:59' }], new Date('2026-10-04T15:00:00Z'))).toBe(true);
  });
});

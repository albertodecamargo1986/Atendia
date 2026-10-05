import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import api from '../../services/api';
import { getErrorMessage } from '../../lib/errors';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export interface CloudTemplate {
  name: string;
  language: string;
  category: string | null;
  body: string;
  variables: string[];
  named: boolean;
  supported: boolean;
}

interface Props {
  open: boolean;
  conversationId: string;
  /** Nome do contato (sugestão para a 1ª variável) */
  contactName?: string;
  onClose: () => void;
  onSent: () => void;
}

const CATEGORY: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidade', AUTHENTICATION: 'Autenticação' };

/** Operador escolhe um modelo aprovado pela Meta (fora da janela de 24 h), preenche e envia. */
export default function TemplatePickerModal({ open, conversationId, contactName, onClose, onSent }: Props) {
  const [templates, setTemplates] = useState<CloudTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected('');
    api.get(`/conversations/${conversationId}/templates`)
      .then(({ data }) => setTemplates(Array.isArray(data) ? data : []))
      .catch((err) => { setTemplates([]); toast.error(getErrorMessage(err, 'Não foi possível carregar os modelos.')); })
      .finally(() => setLoading(false));
  }, [open, conversationId]);

  const tpl = useMemo(() => templates.find((t) => `${t.name}|${t.language}` === selected) || null, [templates, selected]);

  useEffect(() => {
    if (!tpl) return;
    const first = (contactName || '').trim().split(/\s+/)[0] || '';
    setParams(tpl.variables.map((_, i) => (i === 0 && first && !/\d/.test(first) ? first : '')));
  }, [tpl, contactName]);

  const preview = useMemo(() => {
    if (!tpl) return '';
    let out = tpl.body;
    tpl.variables.forEach((v, i) => { out = out.split(new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`, 'g')).join(params[i] || `{{${v}}}`); });
    return out;
  }, [tpl, params]);

  async function handleSend() {
    if (!tpl) return;
    setSending(true);
    try {
      await api.post(`/conversations/${conversationId}/template`, { name: tpl.name, language: tpl.language, params });
      toast.success('Modelo enviado.');
      onSent();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível enviar o modelo.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Enviar modelo aprovado"
      description="Fora da janela de 24 h a Meta só permite modelos aprovados. Quando o cliente responder, a conversa volta a ser livre."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSend} loading={sending} disabled={!tpl || params.some((p) => !p.trim())}>Enviar modelo</Button>
        </>
      )}
    >
      {loading ? (
        <p className="text-sm text-[var(--text-tertiary)]">Carregando modelos...</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Nenhum modelo aprovado encontrado. Crie modelos no Gerenciador do WhatsApp da Meta (Modelos de mensagem) e aguarde a aprovação.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="tpl-select" className="block text-sm font-medium text-[var(--text-primary)] mb-1">Modelo</label>
            <select
              id="tpl-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-sm text-[var(--text-primary)]"
            >
              <option value="">Escolha um modelo...</option>
              {templates.map((t) => (
                <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                  {t.name} ({t.language}){t.category ? ` — ${CATEGORY[t.category] || t.category}` : ''}
                </option>
              ))}
            </select>
          </div>
          {tpl && tpl.variables.map((v, i) => (
            <Input
              key={v}
              label={`Variável {{${v}}}`}
              value={params[i] || ''}
              onChange={(e) => setParams((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
              placeholder={i === 0 ? 'Ex.: nome do cliente' : 'Texto'}
            />
          ))}
          {tpl && (
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Prévia</p>
              <p className="whitespace-pre-wrap text-sm p-3 rounded-lg bg-[var(--surface-secondary)] text-[var(--text-primary)]">{preview}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

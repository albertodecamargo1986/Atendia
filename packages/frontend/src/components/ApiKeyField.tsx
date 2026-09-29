import { useState } from 'react';
import { CheckCircle, Loader2, RefreshCw, Save, Trash2, XCircle, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { getErrorMessage } from '../lib/errors';
import { askConfirm } from './ui/ConfirmDialog';

export type AiProvider = 'OPENAI' | 'ANTHROPIC' | 'ELEVENLABS';

export interface ApiKeyInfo {
  id: string;
  provider: AiProvider;
  isValid: boolean;
  lastTestedAt: string | null;
}

export const PROVIDER_INFO: Record<AiProvider, {
  name: string; subtitle: string; badge: string; badgeClass: string; placeholder: string; helpUrl: string;
}> = {
  OPENAI: {
    name: 'OpenAI (ChatGPT)',
    subtitle: 'Usada pelos agentes GPT — a opção mais comum',
    badge: 'GPT',
    badgeClass: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
    placeholder: 'sk-proj-...',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  ANTHROPIC: {
    name: 'Anthropic (Claude)',
    subtitle: 'Usada pelos agentes Claude',
    badge: 'CL',
    badgeClass: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    placeholder: 'sk-ant-...',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
  ELEVENLABS: {
    name: 'ElevenLabs (voz)',
    subtitle: 'Para respostas em áudio e clonagem de voz',
    badge: '11',
    badgeClass: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
    placeholder: 'sk_...',
    helpUrl: 'https://elevenlabs.io/app/settings/api-keys',
  },
};

interface Props {
  provider: AiProvider;
  info?: ApiKeyInfo;
  onChanged?: () => void;
  /** esconde o botão de remover */
  hideDelete?: boolean;
}

/** Campo para colar, salvar, testar e remover a chave de um provedor de IA. */
export default function ApiKeyField({ provider, info, onChanged, hideDelete }: Props) {
  const meta = PROVIDER_INFO[provider];
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save() {
    const key = value.trim();
    if (!key) return;
    setSaving(true);
    try {
      const { data } = await api.post('/settings/api-keys', { provider, key });
      setValue('');
      if (data?.isValid === false) {
        toast.warning('Chave salva, mas o teste falhou. Confira se copiou a chave inteira e se há crédito na conta.');
      } else {
        toast.success('Chave salva e testada com sucesso!');
      }
      onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar a chave.'));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const { data } = await api.post('/settings/api-keys/test', { provider });
      if (data?.valid) toast.success('A chave está funcionando!');
      else {
        const reason = typeof data?.reason === 'string' ? data.reason : (typeof data?.error === 'string' ? data.error : '');
        toast.error(`A chave não funcionou${reason ? `: ${reason}` : ''}. Confira a chave e o crédito da conta.`);
      }
      onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível testar a chave.'));
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    const ok = await askConfirm({
      title: `Remover a chave ${meta.name}?`,
      description: 'Os agentes que usam este provedor vão parar de responder até você cadastrar outra chave (a menos que o servidor tenha uma chave própria).',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/settings/api-keys/${provider}`);
      toast.success('Chave removida.');
      onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível remover a chave.'));
    }
  }

  return (
    <div className="border border-[var(--border-color)] rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${meta.badgeClass}`}>{meta.badge}</div>
          <div className="min-w-0">
            <p className="font-medium text-[var(--text-primary)] text-sm">{meta.name}</p>
            <p className="text-xs text-[var(--text-tertiary)]">{meta.subtitle}</p>
          </div>
        </div>
        {info && (
          <div className="flex items-center gap-1">
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
              info.isValid ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error)]'
            }`}>
              {info.isValid ? <CheckCircle size={12} /> : <XCircle size={12} />}
              {info.isValid ? 'Funcionando' : 'Com problema'}
            </span>
            <button
              onClick={test}
              disabled={testing}
              aria-label="Testar chave"
              title="Testar chave"
              className="p-1.5 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--color-primary-500)] transition"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
            {!hideDelete && (
              <button
                onClick={remove}
                aria-label="Remover chave"
                title="Remover chave"
                className="p-1.5 rounded hover:bg-[var(--color-error-bg)] text-[var(--color-error)] transition"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={info ? `${meta.placeholder} (já existe uma chave salva)` : meta.placeholder}
            aria-label={`Chave ${meta.name}`}
            autoComplete="off"
            className="w-full px-3 py-2 pr-10 rounded-lg border border-[var(--border-color)] bg-[var(--surface-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-sm font-mono focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? 'Esconder chave' : 'Mostrar chave'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button
          onClick={save}
          disabled={saving || !value.trim()}
          className="px-3 py-2 bg-[var(--color-primary-500)] text-white rounded-lg text-sm hover:bg-[var(--color-primary-600)] disabled:opacity-40 transition inline-flex items-center justify-center gap-1.5"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar e testar
        </button>
      </div>
      <a
        href={meta.helpUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--text-link)] hover:underline"
      >
        Onde consigo minha chave? <ExternalLink size={11} />
      </a>
    </div>
  );
}

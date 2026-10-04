import { useState, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { toast } from 'sonner';
import api from '../services/api';
import { Save, Info } from 'lucide-react';
import { getErrorMessage } from '../lib/errors';

interface BusinessHour {
  id: string;
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function BusinessHoursPage() {
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchHours(); }, []);

  async function fetchHours() {
    try {
      const { data } = await api.get('/business-hours');
      setHours(data);
    } catch {
      setError('Erro ao carregar horários');
    } finally {
      setLoading(false);
    }
  }

  function updateDay(dayOfWeek: number, field: string, value: any) {
    setHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h))
    );
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await Promise.all(
        hours.map((h) =>
          api.put(`/business-hours/${h.dayOfWeek}`, {
            dayOfWeek: h.dayOfWeek,
            isOpen: h.isOpen,
            openTime: h.isOpen ? h.openTime : null,
            closeTime: h.isOpen ? h.closeTime : null,
          })
        )
      );
      setSuccess('Horários salvos com sucesso!');
      toast.success('Horários salvos!');
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao salvar'));
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(dayOfWeek: number) {
    setHours((prev) =>
      prev.map((h) => {
        if (h.dayOfWeek !== dayOfWeek) return h;
        const newIsOpen = !h.isOpen;
        return {
          ...h,
          isOpen: newIsOpen,
          openTime: newIsOpen ? (h.openTime || '00:00') : null,
          closeTime: newIsOpen ? (h.closeTime || '23:59') : null,
        };
      })
    );
  }

  function setAllDay() {
    setHours((prev) =>
      prev.map((h) => ({ ...h, isOpen: true, openTime: '00:00', closeTime: '23:59' }))
    );
  }

  function setBusinessHours() {
    setHours((prev) =>
      prev.map((h) => {
        const isWeekend = h.dayOfWeek === 0 || h.dayOfWeek === 6;
        return { ...h, isOpen: !isWeekend, openTime: isWeekend ? null : '09:00', closeTime: isWeekend ? null : '18:00' };
      })
    );
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">Carregando...</p></div>;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Horário de atendimento"
        description="Os horários em que o agente atende automaticamente"
        actions={<>
          <button onClick={setAllDay} className="px-3 py-2 text-xs font-medium text-[var(--color-primary-500)] bg-[var(--color-primary-50)] hover:bg-[var(--color-primary-100)] rounded-lg transition">
            24h
          </button>
          <button onClick={setBusinessHours} className="px-3 py-2 text-xs font-medium text-[var(--text-secondary)] bg-[var(--surface-tertiary)] hover:bg-[var(--surface-tertiary)] rounded-lg transition">
            Comercial
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
            <Save size={18} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </>}
      />

      {error && <div className="bg-[var(--color-error-bg)] border border-[var(--color-error-border)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
      {success && <div className="bg-[var(--color-success-bg)] border border-[var(--color-success-border)] text-[var(--color-success)] px-4 py-3 rounded-lg text-sm mb-4">{success}</div>}

      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
        <div className="flex items-start gap-3 p-4 bg-[var(--color-info-bg)] rounded-lg mb-6">
          <Info size={18} className="text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-700 space-y-1">
            <p>
              Fora do horário de atendimento, o sistema envia automaticamente uma mensagem informando que retornará no próximo horário comercial e marca a conversa como pendente.
            </p>
            <p className="text-xs text-blue-600">
              Dica: Use <strong>00:00 às 23:59</strong> para atendimento 24h. Horários que cruzam meia-noite (ex: 22:00-06:00) também são suportados.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {hours.sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((h) => (
            <div key={h.id} className={`flex items-center gap-4 p-4 rounded-lg border transition ${
              h.isOpen ? 'border-[var(--border-color)] bg-[var(--surface-primary)]' : 'border-[var(--border-color)] bg-[var(--surface-secondary)]'
            }`}>
              <button onClick={() => toggleDay(h.dayOfWeek)}
                className={`w-12 h-6 rounded-full transition relative ${
                  h.isOpen ? 'bg-[var(--color-primary-500)]' : 'bg-gray-300'
                }`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-[var(--surface-primary)] rounded-full shadow transition ${
                  h.isOpen ? 'left-[26px]' : 'left-0.5'
                }`} />
              </button>

              <span className={`w-24 text-sm font-medium ${h.isOpen ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
                {DAY_LABELS[h.dayOfWeek]}
              </span>

              {h.isOpen ? (
                <div className="flex items-center gap-2 flex-1">
                  <input type="time" value={h.openTime || '00:00'}
                    onChange={(e) => updateDay(h.dayOfWeek, 'openTime', e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none" />
                  <span className="text-[var(--text-tertiary)] text-sm">até</span>
                  <input type="time" value={h.closeTime || '23:59'}
                    onChange={(e) => updateDay(h.dayOfWeek, 'closeTime', e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none" />
                  {h.openTime === '00:00' && h.closeTime === '23:59' && (
                    <span className="text-xs text-[var(--color-primary-500)] font-medium">24h</span>
                  )}
                </div>
              ) : (
                <span className="text-sm text-[var(--text-tertiary)] flex-1">Fechado</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

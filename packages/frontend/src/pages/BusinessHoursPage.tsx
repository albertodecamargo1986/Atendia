import { useState, useEffect } from 'react';
import api from '../services/api';
import { Clock, Save, Info } from 'lucide-react';

interface BusinessHour {
  id: string;
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar');
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

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Carregando...</p></div>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Horário de Atendimento</h1>
          <p className="text-sm text-gray-500 mt-1">Configure os horários em que o agente atende automaticamente</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={setAllDay} className="px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition">
            24h
          </button>
          <button onClick={setBusinessHours} className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition">
            Comercial
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
            <Save size={18} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">{success}</div>}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg mb-6">
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
              h.isOpen ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
            }`}>
              <button onClick={() => toggleDay(h.dayOfWeek)}
                className={`w-12 h-6 rounded-full transition relative ${
                  h.isOpen ? 'bg-indigo-600' : 'bg-gray-300'
                }`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition ${
                  h.isOpen ? 'left-6.5 left-[26px]' : 'left-0.5'
                }`} />
              </button>

              <span className={`w-24 text-sm font-medium ${h.isOpen ? 'text-gray-900' : 'text-gray-400'}`}>
                {DAY_LABELS[h.dayOfWeek]}
              </span>

              {h.isOpen ? (
                <div className="flex items-center gap-2 flex-1">
                  <input type="time" value={h.openTime || '00:00'}
                    onChange={(e) => updateDay(h.dayOfWeek, 'openTime', e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                  <span className="text-gray-400 text-sm">até</span>
                  <input type="time" value={h.closeTime || '23:59'}
                    onChange={(e) => updateDay(h.dayOfWeek, 'closeTime', e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                  {h.openTime === '00:00' && h.closeTime === '23:59' && (
                    <span className="text-xs text-indigo-500 font-medium">24h</span>
                  )}
                </div>
              ) : (
                <span className="text-sm text-gray-400 flex-1">Fechado</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

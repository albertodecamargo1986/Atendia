import { useState } from 'react';
import { getErrorMessage } from '../lib/errors';
import { toast } from 'sonner';
import api from '../services/api';
import { FileDown, Calendar, BarChart3 } from 'lucide-react';

export default function ReportsPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportType, setReportType] = useState<'tickets' | 'conversations' | 'ratings'>('tickets');
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function handleFetchData() {
    setLoading(true);
    try {
      const params: any = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const { data: result } = await api.get('/reports/data', { params });
      setData(result);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params: any = { type: reportType };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const { data: csv } = await api.get('/reports/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([csv as any], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Relatório baixado.');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setExporting(false); }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Relatórios</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Exporte dados e analise os números do atendimento</p>
      </div>

      <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Filtros</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Data início</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Data fim</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Tipo de relatório</label>
            <select value={reportType} onChange={e => setReportType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none">
              <option value="tickets">Atendimentos</option>
              <option value="conversations">Conversas</option>
              <option value="ratings">Avaliações</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={handleFetchData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-500)] text-white text-sm font-medium rounded-lg hover:bg-[var(--color-primary-600)] disabled:opacity-50 transition">
            <Calendar size={16} /> {loading ? 'Carregando...' : 'Ver Dados'}
          </button>
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
            <FileDown size={16} /> {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {data && (
        <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <BarChart3 size={20} /> Resultado
          </h2>
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <div className="bg-[var(--color-primary-50)] rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-[var(--color-primary-600)]">{data.tickets?.length || 0}</p>
              <p className="text-xs text-[var(--color-primary-500)]">Atendimentos</p>
            </div>
            <div className="bg-[var(--color-success-bg)] rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-[var(--color-success)]">{data.conversations?.length || 0}</p>
              <p className="text-xs text-green-500">Conversas</p>
            </div>
            <div className="bg-[var(--color-warning-bg)] rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{data.ratings?.length || 0}</p>
              <p className="text-xs text-yellow-500">Avaliações</p>
            </div>
          </div>

          {reportType === 'ratings' && data.ratings?.length > 0 && (
            <div>
              <p className="text-sm text-[var(--text-secondary)]">Média: {((data.ratings.reduce((s: number, r: any) => s + r.score, 0) / data.ratings.length)).toFixed(1)} / 5.0</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

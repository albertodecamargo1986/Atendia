import { useState, useEffect } from 'react';
import { Key, Loader2, CheckCircle, XCircle, Server } from 'lucide-react';

export default function ActivatePage() {
  const [serial, setSerial] = useState('');
  const [serverUrl, setServerUrl] = useState('http://localhost:3001');
  const [appUrl, setAppUrl] = useState('http://localhost:5173');
  const [activating, setActivating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (window.electronAPI?.getLicenseSerial) {
      window.electronAPI.getLicenseSerial().then((saved: string | null) => {
        if (saved) setSerial(saved);
      });
    }
    if (window.electronAPI?.getServerUrl) {
      window.electronAPI.getServerUrl().then((url: string) => {
        if (url) setServerUrl(url);
      });
    }
    if (window.electronAPI?.getAppUrl) {
      window.electronAPI.getAppUrl().then((url: string) => {
        if (url) setAppUrl(url);
      });
    }
  }, []);

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    if (!serial.trim()) return;

    setActivating(true);
    setResult(null);

    try {
      if (window.electronAPI?.activateLicense) {
        const res = await window.electronAPI.activateLicense(serial.trim());
        if (res.success) {
          setResult({ success: true, message: 'Licença ativada com sucesso!' });
          setTimeout(() => {
            window.electronAPI?.openMainWindow?.();
          }, 1500);
        } else {
          setResult({ success: false, message: res.error || 'Falha na ativação' });
        }
      } else {
        setResult({ success: true, message: 'Ativação simulada (modo browser)' });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Erro ao ativar' });
    } finally {
      setActivating(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (window.electronAPI?.saveLicenseSerial) {
      await window.electronAPI.saveLicenseSerial(serial.trim() || 'pending');
    }
    setResult({ success: true, message: 'Configurações salvas! Clique em Ativar para validar a licença.' });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4">
            <Key size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Ativar AtendIA</h1>
          <p className="text-sm text-gray-500 mt-2">Configure o servidor e insira sua licença</p>
        </div>

        <form onSubmit={handleActivate} className="space-y-4">
          {result && (
            <div
              className={`flex items-center gap-2 p-4 rounded-lg text-sm ${
                result.success
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {result.success ? <CheckCircle size={18} /> : <XCircle size={18} />}
              <span>{result.message}</span>
            </div>
          )}

          {/* Config do Servidor */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Server size={16} />
              <span>Configuração do Servidor</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">URL do Servidor (API)</label>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-mono"
                placeholder="http://seu-servidor.com:3001"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">URL do App (Frontend)</label>
              <input
                type="url"
                value={appUrl}
                onChange={(e) => setAppUrl(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-mono"
                placeholder="http://seu-servidor.com"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveConfig}
              className="w-full py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition"
            >
              Salvar Configurações
            </button>
          </div>

          {/* Chave de Licença */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chave de Licença</label>
            <input
              type="text"
              value={serial}
              onChange={(e) => setSerial(e.target.value.toUpperCase())}
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition font-mono text-center text-lg tracking-wider"
              placeholder="ATND-XXXX-XXXX-XXXX"
            />
          </div>

          <button
            type="submit"
            disabled={activating || !serial.trim()}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {activating ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Ativando...
              </>
            ) : (
              <>
                <Key size={18} /> Ativar
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            Não tem uma licença?{' '}
            <a
              href="https://atend-ia.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              Adquira agora
            </a>
          </p>
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 text-center">AtendIA Desktop v1.0.0 · Windows x64</p>
        </div>
      </div>
    </div>
  );
}

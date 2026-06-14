import { useState, useEffect, useRef, useCallback } from 'react';
import { io as socketIO, Socket } from 'socket.io-client';
import QRCode from 'qrcode';
import {
  Smartphone, Plus, Wifi, WifiOff, Trash2, RefreshCw, QrCode,
} from 'lucide-react';
import api from '../services/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';

interface WASession {
  id: string;
  phoneNumber: string;
  sessionId: string;
  status: string;
  lastConnectedAt?: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  CONNECTING: { color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', label: 'Conectando...' },
  CONNECTED: { color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', label: 'Conectado' },
  DISCONNECTED: { color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', label: 'Desconectado' },
  BANNED: { color: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300', label: 'Banido' },
};

export default function WhatsAppPage() {
  const [sessions, setSessions] = useState<WASession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrImageData, setQrImageData] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    fetchSessions();

    const token = localStorage.getItem('accessToken');
    const wsUrl = import.meta.env.VITE_WS_URL ||
      (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws') : '');
    if (!wsUrl) return;

    const s = socketIO(wsUrl, { auth: { token }, transports: ['websocket'] });

    s.on('whatsapp:qr', async (data: { sessionId: string; baileysSessionId: string; qr: string }) => {
      setQrCode(data.qr);
      setQrSessionId(data.sessionId);
      setConnecting(true);
      try {
        const dataUrl = await QRCode.toDataURL(data.qr, { width: 256, margin: 2 });
        setQrImageData(dataUrl);
      } catch { setQrImageData(null); }
    });

    s.on('whatsapp:status', (data: { sessionId: string; status: string; phoneNumber?: string }) => {
      if (data.status === 'CONNECTED' || data.status === 'DISCONNECTED' || data.status === 'BANNED') {
        setQrCode(null);
        setQrImageData(null);
        setQrSessionId(null);
        setConnecting(false);
      }
      fetchSessions();
    });

    setSocket(s);
    return () => { s.disconnect(); };
  }, []);

  async function fetchSessions() {
    try {
      const { data } = await api.get('/whatsapp');
      setSessions(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleConnect() {
    setConnecting(true);
    setError('');
    setQrCode(null);
    setQrImageData(null);
    try {
      await api.post('/whatsapp/connect');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao conectar');
      setConnecting(false);
    }
  }

  async function handleReconnect(id: string) {
    setConnecting(true);
    setError('');
    setQrCode(null);
    setQrImageData(null);
    try {
      await api.post(`/whatsapp/${id}/reconnect`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao reconectar');
      setConnecting(false);
    }
  }

  async function handleDisconnect(id: string) {
    try {
      await api.post(`/whatsapp/${id}/disconnect`);
      fetchSessions();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao desconectar');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta sessão?')) return;
    try {
      await api.delete(`/whatsapp/${id}`);
      fetchSessions();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao remover');
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-[var(--surface-tertiary)] rounded" />
        <div className="h-4 w-72 bg-[var(--surface-tertiary)] rounded" />
        <div className="h-24 bg-[var(--surface-tertiary)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="WhatsApp"
        description="Conecte seus números de WhatsApp para atendimento via IA"
        actions={
          <Button onClick={handleConnect} disabled={connecting} loading={connecting}>
            <Plus size={18} />
            {connecting ? 'Conectando...' : 'Conectar Número'}
          </Button>
        }
      />

      {error && (
        <Alert variant="error" onClose={() => setError('')} className="mb-4">
          {error}
        </Alert>
      )}

      {/* QR Code */}
      {qrCode && (
        <Card padding="lg" className="mb-6 text-center">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Escaneie o QR Code</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Abra o WhatsApp no celular &rarr; Dispositivos conectados &rarr; Conectar dispositivo
          </p>
          <div className="inline-block p-4 bg-white rounded-xl border-2 border-[var(--border-color)]">
            {qrImageData ? (
              <img src={qrImageData} alt="WhatsApp QR Code" className="w-64 h-64" />
            ) : (
              <div className="w-64 h-64 bg-gray-100 flex items-center justify-center">
                <QrCode size={48} className="text-gray-300" />
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-3">
            O QR Code expira em 60 segundos. Se não funcionar, clique em Conectar novamente.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--color-primary-500)]">
            <RefreshCw size={14} className="animate-spin" />
            Aguardando escaneamento...
          </div>
        </Card>
      )}

      {/* Sessions */}
      {sessions.length === 0 && !qrCode ? (
        <EmptyState
          icon={Smartphone}
          title="Nenhum WhatsApp conectado"
          description="Conecte um número para começar a receber e enviar mensagens via WhatsApp"
          action={{ label: 'Conectar Número', onClick: handleConnect }}
        />
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => {
            const config = STATUS_CONFIG[session.status] || STATUS_CONFIG.DISCONNECTED;
            return (
              <Card key={session.id} padding="md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      session.status === 'CONNECTED' ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'
                    }`}>
                      {session.status === 'CONNECTED'
                        ? <Wifi size={20} className="text-green-600 dark:text-green-400" />
                        : <WifiOff size={20} className="text-gray-400" />
                      }
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-[var(--text-primary)] text-sm truncate">
                        {session.phoneNumber || 'Aguardando...'}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${config.color}`}>{config.label}</span>
                        <span className="text-xs text-[var(--text-tertiary)]">ID: {session.sessionId.slice(0, 12)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {session.status === 'CONNECTED' && (
                      <Button variant="ghost" size="sm" onClick={() => handleDisconnect(session.id)} title="Desconectar">
                        <WifiOff size={16} />
                      </Button>
                    )}
                    {session.status === 'DISCONNECTED' && (
                      <Button variant="ghost" size="sm" onClick={() => handleReconnect(session.id)} title="Reconectar">
                        <RefreshCw size={16} />
                      </Button>
                    )}
                    {session.status !== 'CONNECTING' && session.status !== 'CONNECTED' && (
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(session.id)} title="Remover">
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </div>
                {session.lastConnectedAt && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-2">
                    Última conexão: {new Date(session.lastConnectedAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
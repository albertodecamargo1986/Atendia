import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, QrCode, RefreshCw, Smartphone, X } from 'lucide-react';
import api from '../services/api';
import { useSocketEvent, useSocketSubscription } from '../hooks/useSocket';
import { getErrorMessage } from '../lib/errors';
import { Button } from './ui/Button';

const TIMEOUT_SECONDS = 120;
const POLL_INTERVAL_MS = 3000;

interface Props {
  /** id (do banco) da sessão WhatsApp que está sendo conectada */
  sessionId: string;
  /** chamado quando o celular terminar de conectar */
  onConnected?: (session: { id: string; phoneNumber?: string | null }) => void;
  /** botão "Cancelar" (opcional) */
  onClose?: () => void;
  className?: string;
}

type Phase = 'waiting' | 'connected' | 'timeout' | 'error';

/**
 * Mostra o QR Code do WhatsApp e acompanha até conectar.
 * - Consulta o servidor a cada 3 s (e escuta o tempo real) até status CONNECTED
 * - O QR é trocado automaticamente quando o WhatsApp gera um novo
 * - Depois de 2 minutos sem conectar, oferece gerar um novo QR
 */
export default function WhatsAppQrConnect({ sessionId, onConnected, onClose, className = '' }: Props) {
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);
  const [errorMsg, setErrorMsg] = useState('');
  const [restarting, setRestarting] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  const phaseRef = useRef<Phase>('waiting');
  phaseRef.current = phase;

  const stopTimers = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }, []);

  const lastQrRef = useRef<string | null>(null);
  const updateQr = useCallback((qr: string | null | undefined) => {
    if (!qr || lastQrRef.current === qr) return;
    lastQrRef.current = qr;
    QRCode.toDataURL(qr, { width: 256, margin: 2 })
      .then((url) => { if (lastQrRef.current === qr) setQrImage(url); })
      .catch(() => setQrImage(null));
  }, []);

  const markConnected = useCallback((phoneNumber?: string | null) => {
    if (phaseRef.current === 'connected') return;
    stopTimers();
    setPhase('connected');
    setPhone(phoneNumber || null);
    onConnectedRef.current?.({ id: sessionId, phoneNumber });
  }, [sessionId, stopTimers]);

  const checkStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/whatsapp/${sessionId}`);
      if (data?.status === 'CONNECTED') {
        markConnected(data.phoneNumber);
        return;
      }
      if (data?.qrCode) updateQr(data.qrCode);
    } catch (err) {
      // Erros temporários de rede são ignorados; a próxima consulta tenta de novo
      if ((err as any)?.response?.status === 404) {
        stopTimers();
        setPhase('error');
        setErrorMsg('Esta conexão foi removida. Clique em "Conectar número" para começar de novo.');
      }
    }
  }, [sessionId, markConnected, updateQr, stopTimers]);

  const start = useCallback(() => {
    stopTimers();
    setPhase('waiting');
    setErrorMsg('');
    setSecondsLeft(TIMEOUT_SECONDS);
    checkStatus();
    pollRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          stopTimers();
          setPhase((p) => (p === 'waiting' ? 'timeout' : p));
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, [checkStatus, stopTimers]);

  useEffect(() => {
    lastQrRef.current = null;
    setQrImage(null);
    start();
    return stopTimers;
  }, [sessionId, start, stopTimers]);

  // Tempo real: QR novo e mudança de status chegam na hora
  useSocketSubscription('whatsapp:subscribe', null);
  useSocketEvent<{ sessionId: string; qr: string }>('whatsapp:qr', (data) => {
    if (data?.sessionId === sessionId && phaseRef.current === 'waiting') updateQr(data.qr);
  });
  useSocketEvent<{ sessionId: string; status: string; phoneNumber?: string; reason?: string; message?: string }>('whatsapp:status', (data) => {
    if (data?.sessionId !== sessionId) return;
    if (data.status === 'CONNECTED') {
      markConnected(data.phoneNumber);
      return;
    }
    // Bloqueado, QR expirado, desconectado pelo celular, conectado em outro lugar...: mostra o motivo
    if ((data.status === 'BANNED' || data.status === 'DISCONNECTED' || data.status === 'FAILED') && data.message) {
      stopTimers();
      setPhase('error');
      setErrorMsg(data.message);
    }
  });

  async function handleNewQr() {
    setRestarting(true);
    lastQrRef.current = null;
    setQrImage(null);
    try {
      await api.post(`/whatsapp/${sessionId}/reconnect`);
      start();
    } catch (err) {
      setPhase('error');
      setErrorMsg(getErrorMessage(err, 'Não foi possível gerar um novo QR Code.'));
    } finally {
      setRestarting(false);
    }
  }

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  if (phase === 'connected') {
    return (
      <div className={`text-center py-6 ${className}`}>
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-success-bg)] flex items-center justify-center mb-3">
          <CheckCircle2 size={34} className="text-[var(--color-success)]" />
        </div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">WhatsApp conectado!</h3>
        {phone && <p className="text-sm text-[var(--text-secondary)] mt-1">Número: {phone}</p>}
      </div>
    );
  }

  return (
    <div className={`text-center ${className}`}>
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Escaneie o QR Code com o celular</h3>
      <ol className="text-sm text-[var(--text-secondary)] mb-4 space-y-0.5 text-left inline-block">
        <li>1. Abra o <strong>WhatsApp</strong> no celular da empresa</li>
        <li>2. Toque em <strong>Mais opções (⋮)</strong> ou <strong>Configurações</strong></li>
        <li>3. Toque em <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong></li>
        <li>4. Aponte a câmera para o código abaixo</li>
      </ol>

      <div className="flex justify-center">
        <div className="relative p-3 bg-white rounded-xl border-2 border-[var(--border-color)]">
          {qrImage && phase === 'waiting' ? (
            <img src={qrImage} alt="QR Code do WhatsApp" className="w-56 h-56 sm:w-64 sm:h-64" />
          ) : (
            <div className="w-56 h-56 sm:w-64 sm:h-64 flex flex-col items-center justify-center gap-2 text-gray-400">
              {phase === 'waiting' ? (
                <>
                  <RefreshCw size={32} className="animate-spin" />
                  <span className="text-xs">Gerando o QR Code...</span>
                </>
              ) : (
                <>
                  <QrCode size={48} />
                  <span className="text-xs">QR Code expirado</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {phase === 'waiting' && (
        <div className="mt-4 space-y-1">
          <div className="flex items-center justify-center gap-2 text-sm text-[var(--color-primary-500)]">
            <Smartphone size={14} className="animate-pulse" />
            Aguardando você escanear... <span className="tabular-nums font-medium">{mm}:{ss}</span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            O código muda sozinho de tempos em tempos — é normal. Use sempre o que está na tela.
          </p>
        </div>
      )}

      {phase === 'timeout' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            O tempo acabou antes da leitura. Sem problemas — gere um novo código e tente de novo.
          </p>
          <Button onClick={handleNewQr} loading={restarting}>
            <RefreshCw size={16} /> Gerar novo QR Code
          </Button>
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[var(--color-error)]">{errorMsg}</p>
          <Button onClick={handleNewQr} loading={restarting}>
            <RefreshCw size={16} /> Tentar novamente
          </Button>
        </div>
      )}

      {onClose && (
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => { stopTimers(); onClose(); }}>
            <X size={14} /> Fechar
          </Button>
        </div>
      )}
    </div>
  );
}

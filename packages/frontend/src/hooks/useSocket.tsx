import {
  createContext, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import { io as socketIO, type Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth';
import { onAuthEvent, refreshAccessToken } from '../services/api';

/**
 * Socket.IO único para todo o app.
 * - URL: VITE_WS_URL ou o próprio endereço do site (contrato), path /socket.io
 * - token sempre atual (auth como função)
 * - conecta após login/refresh, desconecta no logout
 */

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

function getSocketUrl(): string {
  const envUrl = (import.meta.env.VITE_WS_URL as string | undefined) || '';
  return envUrl || window.location.origin;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const s = socketIO(getSocketUrl(), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      auth: (cb) => cb({ token: localStorage.getItem('accessToken') }),
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', async (err) => {
      setConnected(false);
      // Token vencido: renova e tenta de novo (uma renovação por vez)
      const msg = (err?.message || '').toLowerCase();
      if ((msg.includes('token') || msg.includes('unauthorized')) && !refreshingRef.current) {
        refreshingRef.current = true;
        try {
          await refreshAccessToken();
          if (!s.connected) s.connect();
        } catch {
          /* o interceptor da API cuida do logout quando necessário */
        } finally {
          refreshingRef.current = false;
        }
      }
    });

    setSocket(s);

    const offRefresh = onAuthEvent('token_refreshed', () => {
      if (!s.connected) s.connect();
    });
    const offExpired = onAuthEvent('session_expired', () => s.disconnect());

    return () => {
      offRefresh();
      offExpired();
      s.removeAllListeners();
      s.disconnect();
      setConnected(false);
    };
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

/** Socket compartilhado (ou null se o usuário não estiver logado). */
export function useSocket(): Socket | null {
  return useContext(SocketContext).socket;
}

/** true quando o tempo real está conectado. */
export function useSocketConnected(): boolean {
  return useContext(SocketContext).connected;
}

/**
 * Escuta um evento do socket. O handler pode mudar a cada render
 * (usa ref) — nada de closures velhas.
 */
export function useSocketEvent<T = any>(event: string, handler: (data: T) => void) {
  const socket = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const wrapper = (data: T) => handlerRef.current(data);
    socket.on(event, wrapper);
    return () => {
      socket.off(event, wrapper);
    };
  }, [socket, event]);
}

/**
 * Entra numa "sala" do socket e volta a entrar a cada reconexão.
 * Ex.: useSocketSubscription('conversation:join', 'conversation:leave', conversationId)
 */
export function useSocketSubscription(
  joinEvent: string,
  leaveEvent: string | null,
  arg?: string | null,
  enabled = true,
) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !enabled) return;
    if (arg === null) return;

    const join = () => {
      if (arg === undefined) socket.emit(joinEvent);
      else socket.emit(joinEvent, arg);
    };
    if (socket.connected) join();
    socket.on('connect', join);

    return () => {
      socket.off('connect', join);
      if (leaveEvent && socket.connected) {
        if (arg === undefined) socket.emit(leaveEvent);
        else socket.emit(leaveEvent, arg);
      }
    };
  }, [socket, joinEvent, leaveEvent, arg, enabled]);
}

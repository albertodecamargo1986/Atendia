import { useEffect, useRef, useCallback } from 'react';
import { io as socketIO, Socket } from 'socket.io-client';

let globalSocket: Socket | null = null;

function getOrCreateSocket(): Socket | null {
  if (globalSocket?.connected) return globalSocket;

  const token = localStorage.getItem('accessToken');
  const wsUrl = import.meta.env.VITE_WS_URL ||
    (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws') : '');

  if (!wsUrl) return null;

  if (!globalSocket) {
    globalSocket = socketIO(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    globalSocket.on('connect', () => console.log('[WS] Connected'));
    globalSocket.on('disconnect', (reason) => console.log('[WS] Disconnected:', reason));
    globalSocket.on('connect_error', (err) => console.warn('[WS] Connection error:', err.message));
  }

  if (globalSocket.disconnected) {
    globalSocket.auth = { token: localStorage.getItem('accessToken') };
    globalSocket.connect();
  }

  return globalSocket;
}

export function useSocket() {
  return getOrCreateSocket();
}

export function useSocketEvent<T = any>(event: string, handler: (data: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getOrCreateSocket();
    if (!socket) return;

    const wrapper = (data: T) => handlerRef.current(data);
    socket.on(event, wrapper);
    return () => {
      socket.off(event, wrapper);
    };
  }, [event]);
}

export function useSocketRoom(room: string, action: 'join' | 'leave') {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getOrCreateSocket();
    if (!socket) return;

    socketRef.current = socket;
    socket.emit(`conversation:${action}`, room);
    console.log(`[WS] ${action} room: ${room}`);

    return () => {
      if (action === 'join') {
        socket.emit('conversation:leave', room);
      }
    };
  }, [room, action]);
}

export function closeSocket() {
  if (globalSocket) {
    globalSocket.removeAllListeners();
    globalSocket.close();
    globalSocket = null;
  }
}
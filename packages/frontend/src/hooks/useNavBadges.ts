import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';
import { hasModule } from '../lib/plans';
import { useSocketConnected, useSocketEvent } from './useSocket';

export interface NavBadges {
  /** atendimentos aguardando alguém pegar */
  tickets: number;
  /** mensagens não lidas no chat da equipe */
  internalChat: number;
}

/**
 * Números do menu lateral. Contagem inicial pela API e atualização pelos eventos
 * do tempo real. Se algo falhar, o número simplesmente não aparece (sem erro na tela).
 */
export function useNavBadges(): NavBadges {
  const tenantPlan = useAuthStore((s) => s.tenant?.plan);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const connected = useSocketConnected();
  const { pathname } = useLocation();
  const [badges, setBadges] = useState<NavBadges>({ tickets: 0, internalChat: 0 });

  const canTickets = isAuthenticated && hasModule(tenantPlan, 'tickets');
  const canChat = isAuthenticated && hasModule(tenantPlan, 'internalChat');

  const loadTickets = useCallback(() => {
    if (!canTickets) return;
    api.get('/tickets/stats')
      .then(({ data }) => {
        const n = Number(data?.pending);
        setBadges((b) => ({ ...b, tickets: Number.isFinite(n) ? n : 0 }));
      })
      .catch(() => { /* sem número */ });
  }, [canTickets]);

  const loadChat = useCallback(() => {
    if (!canChat) return;
    api.get('/internal-chat/unread')
      .then(({ data }) => {
        const n = Number(data?.count);
        setBadges((b) => ({ ...b, internalChat: Number.isFinite(n) ? n : 0 }));
      })
      .catch(() => { /* sem número */ });
  }, [canChat]);

  // Vários eventos seguidos viram uma única consulta
  const ticketTimer = useRef<ReturnType<typeof setTimeout>>();
  const chatTimer = useRef<ReturnType<typeof setTimeout>>();
  const scheduleTickets = useCallback(() => {
    clearTimeout(ticketTimer.current);
    ticketTimer.current = setTimeout(loadTickets, 800);
  }, [loadTickets]);
  const scheduleChat = useCallback(() => {
    clearTimeout(chatTimer.current);
    chatTimer.current = setTimeout(loadChat, 800);
  }, [loadChat]);

  useEffect(() => () => {
    clearTimeout(ticketTimer.current);
    clearTimeout(chatTimer.current);
  }, []);

  // Carga inicial e ao reconectar o tempo real
  useEffect(() => { loadTickets(); }, [loadTickets, connected]);
  useEffect(() => { loadChat(); }, [loadChat, connected]);

  // Ao entrar/sair das telas as leituras mudam
  const prevPath = useRef(pathname);
  useEffect(() => {
    const touched = (p: string) => pathname.startsWith(p) || prevPath.current.startsWith(p);
    if (prevPath.current !== pathname) {
      if (touched('/tickets')) scheduleTickets();
      if (touched('/internal-chat')) scheduleChat();
    }
    prevPath.current = pathname;
  }, [pathname, scheduleTickets, scheduleChat]);

  // Ao voltar para a aba do navegador
  useEffect(() => {
    const onFocus = () => { scheduleTickets(); scheduleChat(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [scheduleTickets, scheduleChat]);

  useSocketEvent('ticket:create', scheduleTickets);
  useSocketEvent('ticket:update', scheduleTickets);
  useSocketEvent('ticket:delete', scheduleTickets);
  useSocketEvent('ticket:assign', scheduleTickets);
  useSocketEvent('internal-message:new', scheduleChat);

  return {
    tickets: canTickets ? badges.tickets : 0,
    internalChat: canChat ? badges.internalChat : 0,
  };
}

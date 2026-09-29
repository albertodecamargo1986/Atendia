import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

/** Base da API. Em produção fica vazio → '/api' no mesmo domínio (contrato). */
export const API_BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// ── Eventos de autenticação (login/refresh/logout) ──
type AuthEvent = 'logout' | 'session_expired' | 'token_refreshed' | 'login';
const authListeners = new Map<AuthEvent, Set<() => void>>();

export function onAuthEvent(event: AuthEvent, fn: () => void) {
  if (!authListeners.has(event)) authListeners.set(event, new Set());
  authListeners.get(event)!.add(fn);
  return () => {
    authListeners.get(event)?.delete(fn);
  };
}

export function emitAuthEvent(event: AuthEvent) {
  authListeners.get(event)?.forEach((fn) => {
    try { fn(); } catch { /* listener com erro não deve quebrar os outros */ }
  });
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Refresh com trava: uma única promise compartilhada por todas as requisições ──
let refreshPromise: Promise<string | null> | null = null;

/**
 * Renova o token de acesso. Usa axios "puro" (sem os interceptors desta instância)
 * para não entrar em laço. Várias chamadas simultâneas compartilham a mesma promise.
 * Retorna o novo accessToken (ou null quando o backend só usa cookie).
 * Rejeita se o refresh falhar.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    const storedRefresh = localStorage.getItem('refreshToken');
    refreshPromise = axios
      .post(
        `${API_BASE_URL}/auth/refresh`,
        storedRefresh ? { refreshToken: storedRefresh } : {},
        { withCredentials: true, headers: { 'Content-Type': 'application/json' } },
      )
      .then(({ data }) => {
        const newAccess: string | null = data?.accessToken || null;
        if (newAccess) localStorage.setItem('accessToken', newAccess);
        if (data?.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        emitAuthEvent('token_refreshed');
        return newAccess;
      })
      .finally(() => {
        // Libera a trava depois que todos os que esperavam receberem o resultado
        setTimeout(() => { refreshPromise = null; }, 0);
      });
  }
  return refreshPromise;
}

const AUTH_PATHS_WITHOUT_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout',
  '/auth/forgot-password', '/auth/reset-password', '/auth/validate-reset-token'];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    const url = originalRequest?.url || '';

    const isAuthRoute = AUTH_PATHS_WITHOUT_REFRESH.some((p) => url.includes(p));

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshAccessToken();
        const token = newToken || localStorage.getItem('accessToken');
        if (token) originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch (refreshErr) {
        // Só desloga se o servidor recusou o refresh (401/403). Erro de rede: mantém a sessão.
        const refreshStatus = axios.isAxiosError(refreshErr) ? refreshErr.response?.status : undefined;
        if (refreshStatus === 401 || refreshStatus === 403 || refreshStatus === 400 || refreshStatus === 422) {
          clearAuthAndRedirect();
        }
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export function clearStoredAuth() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('atendia_user_name');
  localStorage.removeItem('atendia_tenant_name');
  localStorage.removeItem('atendia_tenant_slug');
}

function clearAuthAndRedirect() {
  clearStoredAuth();
  emitAuthEvent('session_expired');
  const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/pricing'];
  if (!publicPaths.some((p) => window.location.pathname.startsWith(p))) {
    window.location.href = '/login';
  }
}

export function clearAuth() {
  clearAuthAndRedirect();
}

/** Monta a URL completa de um endpoint da API (útil para <a href> de download). */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export default api;

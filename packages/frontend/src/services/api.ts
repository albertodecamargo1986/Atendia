import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Event emitter for auth state changes
type AuthEvent = 'logout' | 'session_expired';
const authListeners = new Map<string, Set<() => void>>();

export function onAuthEvent(event: AuthEvent, fn: () => void) {
  if (!authListeners.has(event)) authListeners.set(event, new Set());
  authListeners.get(event)!.add(fn);
  return () => authListeners.get(event)?.delete(fn);
}

function emitAuthEvent(event: AuthEvent) {
  authListeners.get(event)?.forEach(fn => fn());
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL || ''}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        if (data.accessToken) {
          localStorage.setItem('accessToken', data.accessToken);
          if (data.refreshToken) {
            localStorage.setItem('refreshToken', data.refreshToken);
          }
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(originalRequest);
        }

        return api(originalRequest);
      } catch {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          try {
            const { data } = await api.post('/auth/refresh', { refreshToken });
            localStorage.setItem('accessToken', data.accessToken);
            if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
            originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
            return api(originalRequest);
          } catch {
            clearAuthAndRedirect();
          }
        } else {
          clearAuthAndRedirect();
        }
      }
    }
    return Promise.reject(error);
  },
);

function clearAuthAndRedirect() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('atendia_user_name');
  localStorage.removeItem('atendia_tenant_name');
  localStorage.removeItem('atendia_tenant_slug');
  emitAuthEvent('session_expired');
  window.location.href = '/login';
}

export function clearAuth() {
  clearAuthAndRedirect();
}

export default api;
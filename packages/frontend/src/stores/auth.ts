import { create } from 'zustand';
import axios from 'axios';
import api, { clearStoredAuth, emitAuthEvent } from '../services/api';
import { getErrorMessage } from '../lib/errors';

export type Role = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'SUPERVISOR' | 'OPERATOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role | string;
  /** presente quando o backend envia (em /auth/me) */
  twoFactorEnabled?: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  onboardingCompletedAt?: string | null;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  tenantName: string;
  tenantSlug: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** true depois que o checkAuth inicial terminou (com ou sem sucesso) */
  authChecked: boolean;
  login: (email: string, password: string, twoFactorToken?: string, tempToken?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setTenant: (patch: Partial<Tenant>) => void;
}

/** Normaliza a resposta de /auth/me (formato novo do contrato ou formato antigo). */
function parseMe(data: any): { user: User; tenant: Tenant } | null {
  const u = data?.user;
  if (!u) return null;
  const t = u.tenant || data.tenant || {};
  return {
    user: {
      id: u.id || u.sub,
      name: u.name || u.email,
      email: u.email,
      role: u.role,
      twoFactorEnabled: typeof u.twoFactorEnabled === 'boolean' ? u.twoFactorEnabled : undefined,
    },
    tenant: {
      id: t.id || u.tenantId,
      name: t.name || u.tenantName || '',
      slug: t.slug || u.tenantSlug || '',
      plan: t.plan || u.plan || 'FREE',
      onboardingCompletedAt: t.onboardingCompletedAt !== undefined ? t.onboardingCompletedAt : u.onboardingCompletedAt,
    },
  };
}

function storeSession(data: any) {
  if (data?.accessToken) localStorage.setItem('accessToken', data.accessToken);
  if (data?.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
  if (data?.user?.name) localStorage.setItem('atendia_user_name', data.user.name);
  if (data?.tenant?.name) localStorage.setItem('atendia_tenant_name', data.tenant.name);
  if (data?.tenant?.slug) localStorage.setItem('atendia_tenant_slug', data.tenant.slug);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tenant: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,
  authChecked: !localStorage.getItem('accessToken'),

  login: async (email, password, twoFactorToken, tempToken) => {
    set({ isLoading: true });
    try {
      const payload: Record<string, string> = { email, password };
      if (twoFactorToken) payload.twoFactorToken = twoFactorToken;
      if (tempToken) payload.tempToken = tempToken;

      const { data } = await api.post('/auth/login', payload);

      if (data.requiresTwoFactor) {
        set({ isLoading: false });
        const err: any = new Error('2FA_REQUIRED');
        err.requiresTwoFactor = true;
        err.tempToken = data.tempToken;
        throw err;
      }

      storeSession(data);
      set({ user: data.user, tenant: data.tenant, isAuthenticated: true, isLoading: false, authChecked: true });
      emitAuthEvent('login');
      // Completa os dados (plano atual e onboarding) a partir do /auth/me
      await get().checkAuth();
    } catch (err: any) {
      set({ isLoading: false });
      if (err?.requiresTwoFactor) throw err;
      throw new Error(getErrorMessage(err, 'Não foi possível entrar. Confira e-mail e senha.'));
    }
  },

  register: async (payload) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/auth/register', payload);
      storeSession(data);
      set({
        user: data.user,
        tenant: { ...data.tenant, onboardingCompletedAt: data.tenant?.onboardingCompletedAt ?? null },
        isAuthenticated: true,
        isLoading: false,
        authChecked: true,
      });
      emitAuthEvent('login');
    } catch (err: any) {
      set({ isLoading: false });
      throw new Error(getErrorMessage(err, 'Não foi possível criar a conta.'));
    }
  },

  logout: () => {
    const refreshToken = localStorage.getItem('refreshToken');
    api.post('/auth/logout', refreshToken ? { refreshToken } : {}).catch(() => { /* sessão já encerrada */ });
    clearStoredAuth();
    set({ user: null, tenant: null, isAuthenticated: false, authChecked: true });
    emitAuthEvent('logout');
  },

  checkAuth: async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      set({ isAuthenticated: false, user: null, tenant: null, authChecked: true });
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      const parsed = parseMe(data);
      if (!parsed) throw new Error('Resposta inválida');
      set({ user: parsed.user, tenant: parsed.tenant, isAuthenticated: true, authChecked: true });
    } catch (err) {
      // Só desloga quando o servidor diz que a sessão é inválida.
      // Erro de rede / servidor fora do ar: mantém a sessão para tentar de novo.
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401 || status === 403) {
        clearStoredAuth();
        set({ user: null, tenant: null, isAuthenticated: false, authChecked: true });
      } else {
        set({ authChecked: true });
      }
    }
  },

  setTenant: (patch) => {
    const current = get().tenant;
    if (current) set({ tenant: { ...current, ...patch } });
  },
}));

export function isOwnerOrAdmin(role?: string | null): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

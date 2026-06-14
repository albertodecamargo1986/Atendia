import { create } from 'zustand';
import api from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, twoFactorToken?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  tenantName: string;
  tenantSlug: string;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenant: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,

  login: async (email, password, twoFactorToken) => {
    set({ isLoading: true });
    try {
      const payload: any = { email, password };
      if (twoFactorToken) payload.twoFactorToken = twoFactorToken;

      const { data } = await api.post('/auth/login', payload);

      if (data.requiresTwoFactor) {
        set({ isLoading: false });
        const err: any = new Error('2FA_REQUIRED');
        err.requiresTwoFactor = true;
        throw err;
      }

      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('atendia_user_name', data.user.name);
      localStorage.setItem('atendia_tenant_name', data.tenant.name);
      localStorage.setItem('atendia_tenant_slug', data.tenant.slug);
      set({ user: data.user, tenant: data.tenant, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      if (err.requiresTwoFactor) throw err;
      throw new Error(err.response?.data?.error || 'Erro ao fazer login');
    }
  },

  register: async (data) => {
    set({ isLoading: true });
    try {
      const res = await api.post('/auth/register', data);
      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      localStorage.setItem('atendia_user_name', res.data.user.name);
      localStorage.setItem('atendia_tenant_name', res.data.tenant.name);
      localStorage.setItem('atendia_tenant_slug', res.data.tenant.slug);
      set({ user: res.data.user, tenant: res.data.tenant, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw new Error(err.response?.data?.error || 'Erro ao criar conta');
    }
  },

  logout: () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      api.post('/auth/logout', { refreshToken }).catch(() => {});
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('atendia_user_name');
    localStorage.removeItem('atendia_tenant_name');
    localStorage.removeItem('atendia_tenant_slug');
    set({ user: null, tenant: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      set({ isAuthenticated: false, user: null, tenant: null });
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      const u = data.user;
      set({
        user: { id: u.sub, name: u.name, email: u.email, role: u.role },
        tenant: { id: u.tenantId, name: u.tenantName, slug: u.tenantSlug, plan: u.plan },
        isAuthenticated: true,
      });
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ user: null, tenant: null, isAuthenticated: false });
    }
  },
}));

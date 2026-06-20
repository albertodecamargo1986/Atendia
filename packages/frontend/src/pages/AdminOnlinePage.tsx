import { useState, useEffect } from 'react';
import api from '../services/api';
import { Users, Wifi, WifiOff, RefreshCw, Clock, Loader2 } from 'lucide-react';

interface OnlineUser {
  userId: string;
  lastSeen: string;
}

interface TenantOnline {
  tenantId: string;
  users: OnlineUser[];
  tenantName?: string;
}

export default function AdminOnlinePage() {
  const [tenants, setTenants] = useState<TenantOnline[]>([]);
  const [totalOnline, setTotalOnline] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchOnline();
    const interval = setInterval(fetchOnline, 30000); // atualiza a cada 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchOnline() {
    try {
      const { data } = await api.get('/admin/online');
      const tenantsData = Array.isArray(data) ? data : [];
      setTenants(tenantsData);
      setTotalOnline(tenantsData.reduce((acc: number, t: TenantOnline) => acc + t.users.length, 0));
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  function formatLastSeen(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `agora`;
    if (seconds < 300) return `${Math.floor(seconds / 60)}min atras`;
    return new Date(dateStr).toLocaleTimeString('pt-BR');
  }

  function getInitials(userId: string) {
    return userId.substring(0, 2).toUpperCase();
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={32} className="animate-spin text-purple-600" /></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Usuarios Online</h1>
            {totalOnline > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {totalOnline} online
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Usuarios ativos nos ultimos 5 minutos
          </p>
        </div>
        <button onClick={() => { setRefreshing(true); fetchOnline(); }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-secondary)] bg-[var(--surface-secondary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {tenants.length === 0 ? (
        <div className="text-center py-16 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)]">
          <WifiOff size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Nenhum usuario online</h3>
          <p className="text-[var(--text-tertiary)] mt-1">Os usuarios aparecerao aqui quando estiverem ativos no sistema.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tenants.map((tenant) => (
            <div key={tenant.tenantId} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border-color)] bg-[var(--surface-secondary)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-purple-600" />
                  <span className="font-medium text-sm text-[var(--text-primary)]">
                    {tenant.tenantName || `Tenant ${tenant.tenantId.substring(0, 8)}`}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-tertiary)]">{tenant.users.length} usuario(s)</span>
              </div>
              <div className="divide-y divide-[var(--border-color)]">
                {tenant.users.map((user) => (
                  <div key={user.userId} className="flex items-center justify-between px-5 py-3 hover:bg-[var(--surface-tertiary)] transition">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                        <Wifi size={16} className="text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          Usuario {user.userId.substring(0, 8)}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)]">{user.userId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                      <Clock size={12} />
                      {formatLastSeen(user.lastSeen)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

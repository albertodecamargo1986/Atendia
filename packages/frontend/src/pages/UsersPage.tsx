import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';
import {
  Users, Plus, Shield, UserCheck, UserX, MoreVertical,
  Trash2, Power, PowerOff, ChevronDown, X, Mail, Lock, BadgeCheck,
} from 'lucide-react';

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: string;
  _count?: { conversations: number; auditLogs: number };
}

interface TeamStats {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<string, number>;
}

const roleLabels: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  OWNER: { label: 'Owner', color: 'bg-purple-100 text-purple-700', icon: Shield },
  ADMIN: { label: 'Admin', color: 'bg-indigo-100 text-indigo-700', icon: Shield },
  SUPERVISOR: { label: 'Supervisor', color: 'bg-blue-100 text-blue-700', icon: BadgeCheck },
  OPERATOR: { label: 'Operador', color: 'bg-gray-100 text-gray-700', icon: Users },
};

export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', password: '', role: 'OPERATOR' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const isOwner = currentUser?.role === 'OWNER';

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    try {
      setLoading(true);
      const [usersRes, statsRes] = await Promise.all([
        api.get('/users'),
        api.get('/users/stats').catch(() => ({ data: null })),
      ]);
      setUsers(usersRes.data);
      if (statsRes.data) setStats(statsRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar equipe');
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError('');
    try {
      await api.post('/users', inviteForm);
      setShowInvite(false);
      setInviteForm({ name: '', email: '', password: '', role: 'OPERATOR' });
      fetchUsers();
    } catch (err: any) {
      setInviteError(err.response?.data?.error || 'Erro ao convidar usuário');
    } finally {
      setInviteLoading(false);
    }
  }

  async function toggleActive(userId: string) {
    setMenuOpenId(null);
    try {
      await api.post(`/users/${userId}/toggle-active`);
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao alterar status');
    }
  }

  async function changeRole(userId: string, role: string) {
    setMenuOpenId(null);
    try {
      await api.patch(`/users/${userId}`, { role });
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao alterar cargo');
    }
  }

  async function deleteUser(userId: string) {
    setMenuOpenId(null);
    if (!confirm('Tem certeza que deseja remover este usuário? Esta ação é irreversível.')) return;
    try {
      await api.delete(`/users/${userId}`);
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao remover usuário');
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Users className="animate-pulse text-indigo-400" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={28} className="text-indigo-600" />
            Equipe
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie os membros da sua equipe e suas permissões
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus size={18} />
          Convidar Membro
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={16} className="text-red-400 hover:text-red-600" /></button>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center mb-2">
              <Users size={18} className="text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center mb-2">
              <UserCheck size={18} className="text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            <p className="text-xs text-gray-500">Ativos</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center mb-2">
              <UserX size={18} className="text-red-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.inactive}</p>
            <p className="text-xs text-gray-500">Inativos</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center mb-2">
              <Shield size={18} className="text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.byRole?.ADMIN || 0}</p>
            <p className="text-xs text-gray-500">Admins</p>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Membro</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Cargo</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Conversas</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Desde</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const roleInfo = roleLabels[u.role] || roleLabels.OPERATOR;
                const RoleIcon = roleInfo.icon;
                const isCurrentUser = u.id === currentUser?.id;

                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {u.name}
                            {isCurrentUser && (
                              <span className="text-xs text-indigo-500 ml-1">(você)</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${roleInfo.color}`}>
                        <RoleIcon size={12} />
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.isActive ? 'text-green-700' : 'text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {u.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {u._count?.conversations || 0}
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      {!isCurrentUser && u.role !== 'OWNER' && (
                        <div className="relative">
                          <button
                            onClick={() => setMenuOpenId(menuOpenId === u.id ? null : u.id)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {menuOpenId === u.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                              <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white rounded-lg border border-gray-200 shadow-lg py-1">
                                <button
                                  onClick={() => toggleActive(u.id)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                                >
                                  {u.isActive ? (
                                    <><PowerOff size={14} className="text-orange-500" /> Desativar</>
                                  ) : (
                                    <><Power size={14} className="text-green-600" /> Ativar</>
                                  )}
                                </button>

                                <div className="border-t border-gray-100 my-1" />
                                <p className="px-4 py-1 text-xs text-gray-400 font-medium">Alterar cargo</p>
                                {['ADMIN', 'SUPERVISOR', 'OPERATOR'].filter(r => r !== u.role).map(r => (
                                  <button
                                    key={r}
                                    onClick={() => changeRole(u.id, r)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                                  >
                                    <span className={`px-2 py-0.5 rounded text-xs ${roleLabels[r]?.color}`}>
                                      {roleLabels[r]?.label}
                                    </span>
                                  </button>
                                ))}

                                {isOwner && (
                                  <>
                                    <div className="border-t border-gray-100 my-1" />
                                    <button
                                      onClick={() => deleteUser(u.id)}
                                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                                    >
                                      <Trash2 size={14} />
                                      Remover
                                    </button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="text-center py-16">
            <Users size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Nenhum membro na equipe</h3>
            <p className="text-gray-500 mt-1 mb-4">Convide membros para colaborar no atendimento</p>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowInvite(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Convidar Membro</h2>
              <button onClick={() => setShowInvite(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {inviteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
                <div className="relative">
                  <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={inviteForm.name}
                    onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Nome do membro"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha temporária</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={inviteForm.password}
                    onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                <div className="relative">
                  <select
                    value={inviteForm.role}
                    onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none appearance-none bg-white"
                  >
                    <option value="OPERATOR">Operador</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {inviteForm.role === 'ADMIN' && 'Acesso total: gerenciar equipe, configurações e todos os módulos'}
                  {inviteForm.role === 'SUPERVISOR' && 'Pode acompanhar conversas e escalar atendimentos'}
                  {inviteForm.role === 'OPERATOR' && 'Acesso básico: atender conversas atribuídas'}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {inviteLoading ? 'Convidando...' : 'Convidar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

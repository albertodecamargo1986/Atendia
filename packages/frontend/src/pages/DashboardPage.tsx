import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import api from '../services/api';
import {
  Bot, MessageSquare, Smartphone, TrendingUp, Users, Clock,
  ArrowRight, Ticket, Zap, AlertCircle, BarChart3,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6'];

interface DailyData { date: string; conversations: number; tickets: number; resolved: number; }

function SkeletonCard() {
  return (
    <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-4 animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-[var(--surface-tertiary)] mb-3" />
      <div className="h-7 w-16 bg-[var(--surface-tertiary)] rounded mb-1" />
      <div className="h-4 w-20 bg-[var(--surface-tertiary)] rounded" />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6 animate-pulse">
      <div className="h-5 w-48 bg-[var(--surface-tertiary)] rounded mb-4" />
      <div className="h-60 bg-[var(--surface-tertiary)] rounded" />
    </div>
  );
}

export default function DashboardPage() {
  const { user, tenant } = useAuthStore();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ active: 0, pending: 0, resolved: 0, takeover: 0, total: 0 });
  const [agentCount, setAgentCount] = useState(0);
  const [whatsappCount, setWhatsappCount] = useState(0);
  const [teamCount, setTeamCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [ticketStats, setTicketStats] = useState({ pending: 0, open: 0, closed: 0 });

  useEffect(() => {
    Promise.all([
      api.get('/conversations/stats').catch(() => ({ data: { active: 0, pending: 0, resolved: 0, takeover: 0, total: 0 } })),
      api.get('/agents').catch(() => ({ data: [] })),
      api.get('/whatsapp').catch(() => ({ data: [] })),
      api.get('/users').catch(() => ({ data: [] })),
      api.get('/conversations/stats/daily?days=14').catch(() => ({ data: [] })),
      api.get('/tickets/stats').catch(() => ({ data: { pending: 0, open: 0, closed: 0 } })),
    ]).then(([convRes, agentsRes, waRes, usersRes, dailyRes, ticketRes]) => {
      setStats(convRes.data);
      setAgentCount(agentsRes.data.length);
      setWhatsappCount(waRes.data.filter((s: any) => s.status === 'CONNECTED').length);
      setTeamCount(usersRes.data.length);
      setDailyData(dailyRes.data);
      setTicketStats(ticketRes.data);
    }).finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Conversas Ativas', value: stats.active, icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
    { label: 'Agentes', value: agentCount, icon: Bot, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950' },
    { label: 'WhatsApp', value: whatsappCount, icon: Smartphone, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
    { label: 'Pendentes', value: stats.pending, icon: TrendingUp, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950' },
    { label: 'Resolvidas', value: stats.resolved, icon: BarChart3, color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-900' },
    { label: 'Equipe', value: teamCount, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950' },
  ];

  const pieData = [
    { name: 'Pendentes', value: ticketStats.pending },
    { name: 'Em Atendimento', value: ticketStats.open },
    { name: 'Fechados', value: ticketStats.closed },
  ].filter(d => d.value > 0);

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Bem-vindo{user?.name ? `, ${user.name}` : ''}!
          {tenant && <span className="text-[var(--text-tertiary)]"> ({tenant.name})</span>}
        </p>
      </div>

      {loading ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SkeletonChart />
            <SkeletonChart />
          </div>
        </>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {cards.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-4 hover:shadow-card transition-shadow">
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                  <Icon size={18} className={color} />
                </div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Area Chart */}
            <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                Conversas e Tickets (14 dias)
              </h2>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Area type="monotone" dataKey="conversations" name="Conversas" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="tickets" name="Tickets" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="resolved" name="Resolvidos" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-60 text-[var(--text-tertiary)]">
                  <BarChart3 size={32} className="mb-2" />
                  <p className="text-sm">Sem dados para o gráfico</p>
                </div>
              )}
            </div>

            {/* Pie Chart */}
            <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Tickets por Status</h2>
              <div className="flex items-center gap-6">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4} dataKey="value">
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--surface-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center w-1/2 h-48 text-[var(--text-tertiary)]">
                    <Ticket size={28} className="mb-1" />
                    <p className="text-sm">Sem tickets</p>
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-sm text-[var(--text-primary)]">{d.name}</span>
                      </div>
                      <span className="font-semibold text-[var(--text-primary)]">{d.value}</span>
                    </div>
                  ))}
                  {pieData.length === 0 && (
                    <p className="text-sm text-[var(--text-tertiary)]">Nenhum ticket registrado</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Start + Activity */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Comece a usar</h2>
              <div className="grid gap-3 mt-4">
                <button onClick={() => navigate('/agents/new')}
                  className="flex items-center gap-3 p-4 rounded-lg bg-[var(--color-primary-50)] border border-[var(--color-primary-200)] hover:bg-[var(--color-primary-100)] transition text-left group">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-primary-100)] flex items-center justify-center shrink-0">
                    <span className="text-[var(--color-primary-600)] font-bold text-sm">1</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[var(--color-primary-900)] text-sm">Crie um Agente</h3>
                    <p className="text-xs text-[var(--color-primary-600)] mt-0.5">Configure um agente de IA com suas instruções</p>
                  </div>
                  <ArrowRight size={16} className="text-[var(--color-primary-400)] group-hover:text-[var(--color-primary-600)] transition shrink-0" />
                </button>
                <button onClick={() => navigate('/whatsapp')}
                  className="flex items-center gap-3 p-4 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success-border)] hover:brightness-95 transition text-left group">
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-success-bg)] flex items-center justify-center shrink-0 border border-[var(--color-success-border)]">
                    <span className="text-[var(--color-success)] font-bold text-sm">2</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[var(--text-primary)] text-sm">Conecte o WhatsApp</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Escaneie o QR Code para conectar</p>
                  </div>
                  <ArrowRight size={16} className="text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition shrink-0" />
                </button>
                <button onClick={() => navigate('/team')}
                  className="flex items-center gap-3 p-4 rounded-lg bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 hover:brightness-95 transition text-left group">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center shrink-0">
                    <span className="text-purple-600 font-bold text-sm">3</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-purple-900 dark:text-purple-100 text-sm">Monte sua Equipe</h3>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">Convide membros para colaborar</p>
                  </div>
                  <ArrowRight size={16} className="text-purple-400 shrink-0" />
                </button>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Resumo de Atividade</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-[var(--text-secondary)]">Conversas ativas vs. total</span>
                    <span className="font-medium text-[var(--text-primary)]">{stats.active}/{stats.total}</span>
                  </div>
                  <div className="w-full bg-[var(--surface-tertiary)] rounded-full h-2">
                    <div className="bg-[var(--color-primary-500)] h-2 rounded-full transition-all" style={{ width: stats.total ? `${(stats.active / stats.total) * 100}%` : '0%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-[var(--text-secondary)]">Resolvidas</span>
                    <span className="font-medium text-[var(--text-primary)]">{stats.resolved}</span>
                  </div>
                  <div className="w-full bg-[var(--surface-tertiary)] rounded-full h-2">
                    <div className="bg-[var(--color-success)] h-2 rounded-full transition-all" style={{ width: stats.total ? `${(stats.resolved / stats.total) * 100}%` : '0%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-[var(--text-secondary)]">Takeover humano</span>
                    <span className="font-medium text-[var(--text-primary)]">{stats.takeover}</span>
                  </div>
                  <div className="w-full bg-[var(--surface-tertiary)] rounded-full h-2">
                    <div className="bg-[var(--color-warning)] h-2 rounded-full transition-all" style={{ width: stats.total ? `${(stats.takeover / stats.total) * 100}%` : '0%' }} />
                  </div>
                </div>
                <div className="pt-3 border-t border-[var(--border-color)]">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <Clock size={14} />
                    <span>
                      {agentCount} agente{agentCount !== 1 ? 's' : ''} ativo{agentCount !== 1 ? 's' : ''} &middot;
                      {whatsappCount} WhatsApp conectado{whatsappCount !== 1 ? 's' : ''} &middot;
                      {teamCount} membro{teamCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
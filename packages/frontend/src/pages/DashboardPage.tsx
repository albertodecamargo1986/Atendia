import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, isOwnerOrAdmin } from '../stores/auth';
import { fetchOnboardingProgress, type OnboardingProgress } from '../lib/onboarding';
import api from '../services/api';
import {
  Bot, MessageSquare, Smartphone, TrendingUp, Users, Clock,
  ArrowRight, Ticket, BarChart3, CheckCircle2, Circle, WifiOff,
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
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const isManager = isOwnerOrAdmin(user?.role);

  useEffect(() => {
    Promise.all([
      api.get('/conversations/stats').catch(() => ({ data: { active: 0, pending: 0, resolved: 0, takeover: 0, total: 0 } })),
      isManager ? api.get('/agents').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      isManager ? api.get('/whatsapp').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      api.get('/users/colleagues').catch(() => ({ data: [] })),
      api.get('/conversations/stats/daily?days=14').catch(() => ({ data: [] })),
      api.get('/tickets/stats').catch(() => ({ data: { pending: 0, open: 0, closed: 0 } })),
    ]).then(([convRes, agentsRes, waRes, usersRes, dailyRes, ticketRes]) => {
      setStats({ active: 0, pending: 0, resolved: 0, takeover: 0, total: 0, ...(convRes.data || {}) });
      setAgentCount(Array.isArray(agentsRes.data) ? agentsRes.data.filter((a: any) => a.isActive !== false).length : 0);
      if (Array.isArray(waRes.data)) {
        setWhatsappCount(waRes.data.filter((s: any) => s.status === 'CONNECTED').length);
        setSessionsLoaded(true);
      }
      setTeamCount(Array.isArray(usersRes.data) ? usersRes.data.length : 0);
      setDailyData(Array.isArray(dailyRes.data) ? dailyRes.data : []);
      setTicketStats({ pending: 0, open: 0, closed: 0, ...(ticketRes.data || {}) });
    }).finally(() => setLoading(false));
    if (isManager) fetchOnboardingProgress().then(setProgress).catch(() => setProgress(null));
  }, [isManager]);

  const checklist = progress ? [
    { label: 'Conectar o WhatsApp', hint: 'Leia o QR Code com o celular da empresa', done: progress.steps.whatsapp || whatsappCount > 0, to: '/whatsapp' },
    { label: 'Cadastrar a chave da IA', hint: 'Necessária para o agente responder', done: progress.steps.aiKey, to: '/settings' },
    { label: 'Criar e ativar um agente', hint: 'Escolha um modelo pronto e ajuste', done: progress.steps.agent, to: '/agents' },
    { label: 'Definir o horário de atendimento', hint: '24 horas ou horário comercial', done: progress.steps.businessHours, to: '/business-hours' },
  ] : [];
  const doneCount = checklist.filter((c) => c.done).length;

  const cards = [
    { label: 'Conversas ativas', value: stats.active, icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950' },
    { label: 'Agentes ativos', value: agentCount, icon: Bot, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950' },
    { label: 'WhatsApp', value: whatsappCount, icon: Smartphone, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950' },
    { label: 'Pendentes', value: stats.pending, icon: TrendingUp, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950' },
    { label: 'Resolvidas', value: stats.resolved, icon: BarChart3, color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-900' },
    { label: 'Equipe', value: teamCount, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950' },
  ];

  const pieData = [
    { name: 'Pendentes', value: ticketStats.pending },
    { name: 'Em Atendimento', value: ticketStats.open },
    { name: 'Encerrados', value: ticketStats.closed },
  ].filter(d => d.value > 0);

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Painel</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Olá{user?.name ? `, ${user.name}` : ''}!
          {tenant && <span className="text-[var(--text-tertiary)]"> ({tenant.name})</span>}
        </p>
      </div>

      {isManager && sessionsLoaded && whatsappCount === 0 && (
        <div role="alert" className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-[var(--color-error-border)] bg-[var(--color-error-bg)]">
          <WifiOff size={22} className="text-[var(--color-error)] shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-[var(--color-error)]">WhatsApp desconectado</p>
            <p className="text-sm text-[var(--text-secondary)]">Enquanto nenhum número estiver conectado, o AtendIA não recebe nem responde mensagens.</p>
          </div>
          <button onClick={() => navigate('/whatsapp')} className="px-4 py-2 rounded-lg bg-[var(--color-error)] text-white text-sm font-medium hover:opacity-90">
            Reconectar
          </button>
        </div>
      )}

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
                Conversas e atendimentos (14 dias)
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
                    <Area type="monotone" dataKey="tickets" name="Atendimentos" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} />
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
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Atendimentos por situação</h2>
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
                    <p className="text-sm">Sem atendimentos</p>
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
                    <p className="text-sm text-[var(--text-tertiary)]">Nenhum atendimento registrado</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Checklist de configuração + Atividade */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {isManager && progress ? (
              <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Configuração da conta</h2>
                  <span className="text-xs text-[var(--text-secondary)]">{doneCount} de {checklist.length} prontos</span>
                </div>
                <div className="w-full bg-[var(--surface-tertiary)] rounded-full h-1.5 mb-4">
                  <div className="bg-[var(--color-success)] h-1.5 rounded-full transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
                </div>
                <ul className="space-y-2">
                  {checklist.map((item) => (
                    <li key={item.label}>
                      <button
                        onClick={() => navigate(item.to)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-secondary)] transition text-left group"
                      >
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          item.done ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]' : 'bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]'
                        }`}>
                          {item.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm font-medium ${item.done ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'}`}>{item.label}</span>
                          {!item.done && <span className="block text-xs text-[var(--text-tertiary)]">{item.hint}</span>}
                        </span>
                        <ArrowRight size={16} className="text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
                {doneCount < checklist.length && (
                  <button onClick={() => navigate('/onboarding')} className="mt-4 text-sm font-medium text-[var(--color-primary-500)] hover:underline">
                    Abrir o assistente de configuração
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Atalhos</h2>
                <div className="grid gap-3 mt-4">
                  {[
                    { to: '/tickets', label: 'Atendimentos', hint: 'Veja quem está esperando resposta' },
                    { to: '/conversations', label: 'Conversas', hint: 'Acompanhe as conversas do WhatsApp' },
                    { to: '/contacts', label: 'Contatos', hint: 'Clientes que já falaram com a empresa' },
                  ].map((a) => (
                    <button key={a.to} onClick={() => navigate(a.to)}
                      className="flex items-center gap-3 p-4 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-secondary)] transition text-left group">
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-[var(--text-primary)] text-sm">{a.label}</span>
                        <span className="block text-xs text-[var(--text-secondary)] mt-0.5">{a.hint}</span>
                      </span>
                      <ArrowRight size={16} className="text-[var(--text-tertiary)] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                    <span className="text-[var(--text-secondary)]">Assumidas por humanos</span>
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
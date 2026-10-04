import { useState, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { toast } from 'sonner';
import api from '../services/api';
import { Bot, Plus, Power, PowerOff, Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../lib/errors';
import { askConfirm } from '../components/ui/ConfirmDialog';

interface Agent {
  id: string;
  name: string;
  description?: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  toneOfVoice: string;
  language: string;
  customPrompt?: string;
  isActive: boolean;
  isDraft: boolean;
  createdAt: string;
  _count?: { conversations: number; knowledgeBases: number };
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function fetchAgents() {
    try {
      const { data } = await api.get('/agents');
      setAgents(data);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao carregar agentes'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAgents(); }, []);

  async function toggleActive(agent: Agent) {
    try {
      const endpoint = agent.isActive ? 'deactivate' : 'activate';
      await api.post(`/agents/${agent.id}/${endpoint}`);
      toast.success(agent.isActive ? 'Agente desativado. Ele não responde mais.' : 'Agente ativado! Ele já pode responder.');
      fetchAgents();
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao alterar status'));
    }
  }

  async function deleteAgent(id: string) {
    if (!(await askConfirm({ title: 'Tem certeza que deseja excluir este agente?', confirmLabel: 'Confirmar', danger: true }))) return;
    try {
      await api.delete(`/agents/${id}`);
      toast.success('Removido com sucesso.');
      fetchAgents();
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao deletar'));
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">Carregando agentes...</p></div>;
  }

  return (
    <div>
      <PageHeader
        title="Meus agentes"
        description="Os agentes de IA que atendem seus clientes"
        actions={
          <button
            onClick={() => navigate('/agents/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition"
          >
            <Plus size={18} />
            Novo agente
          </button>
        }
      />


      {agents.length === 0 ? (
        <div className="text-center py-16 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)]">
          <Bot size={48} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Nenhum agente criado</h3>
          <p className="text-[var(--text-secondary)] mt-1 mb-4">Crie seu primeiro agente de IA para começar a atender clientes</p>
          <button
            onClick={() => navigate('/agents/new')}
            className="px-4 py-2 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition"
          >
            Criar Agente
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agent.isActive ? 'bg-green-100' : 'bg-[var(--surface-tertiary)]'}`}>
                      <Bot size={20} className={agent.isActive ? 'text-green-600' : 'text-[var(--text-tertiary)]'} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[var(--text-primary)]">{agent.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${agent.isActive ? 'bg-green-100 text-[var(--color-success)]' : 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]'}`}>
                          {agent.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                        {agent.isDraft && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Rascunho</span>
                        )}
                        <span className="text-xs text-[var(--text-tertiary)]">{agent.model}</span>
                      </div>
                    </div>
                  </div>
                  {agent.description && (
                    <p className="text-sm text-[var(--text-secondary)] mt-2">{agent.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-tertiary)]">
                    <span>{agent._count?.conversations || 0} conversas</span>
                    <span>{agent._count?.knowledgeBases || 0} bases de conhecimento</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleActive(agent)}
                    className={`p-2 rounded-lg transition ${agent.isActive ? 'hover:bg-[var(--color-error-bg)] text-[var(--color-error)]' : 'hover:bg-[var(--color-success-bg)] text-green-600'}`}
                    title={agent.isActive ? 'Desativar' : 'Ativar'} aria-label={agent.isActive ? 'Desativar' : 'Ativar'}
                  >
                    {agent.isActive ? <PowerOff size={18} /> : <Power size={18} />}
                  </button>
                  <button
                    onClick={() => navigate(`/agents/${agent.id}`)}
                    className="p-2 rounded-lg hover:bg-[var(--color-primary-50)] text-[var(--color-primary-500)] transition"
                    title="Editar" aria-label="Editar"
                  >
                    <ExternalLink size={18} />
                  </button>
                  <button
                    onClick={() => deleteAgent(agent.id)}
                    className="p-2 rounded-lg hover:bg-[var(--color-error-bg)] text-red-400 transition"
                    title="Deletar" aria-label="Deletar"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

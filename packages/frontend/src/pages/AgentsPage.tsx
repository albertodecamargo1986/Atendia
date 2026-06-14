import { useState, useEffect } from 'react';
import api from '../services/api';
import { Bot, Plus, Power, PowerOff, Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function fetchAgents() {
    try {
      const { data } = await api.get('/agents');
      setAgents(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar agentes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAgents(); }, []);

  async function toggleActive(agent: Agent) {
    try {
      const endpoint = agent.isActive ? 'deactivate' : 'activate';
      await api.post(`/agents/${agent.id}/${endpoint}`);
      fetchAgents();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao alterar status');
    }
  }

  async function deleteAgent(id: string) {
    if (!confirm('Tem certeza que deseja deletar este agente?')) return;
    try {
      await api.delete(`/agents/${id}`);
      fetchAgents();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao deletar');
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Carregando agentes...</p></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Agentes</h1>
          <p className="text-sm text-gray-500 mt-1">Configure seus agentes de IA para atendimento</p>
        </div>
        <button
          onClick={() => navigate('/agents/new')}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus size={18} />
          Novo Agente
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
      )}

      {agents.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Bot size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nenhum agente criado</h3>
          <p className="text-gray-500 mt-1 mb-4">Crie seu primeiro agente de IA para começar a atender clientes</p>
          <button
            onClick={() => navigate('/agents/new')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
          >
            Criar Agente
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agent.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                      <Bot size={20} className={agent.isActive ? 'text-green-600' : 'text-gray-400'} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${agent.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {agent.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                        {agent.isDraft && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Rascunho</span>
                        )}
                        <span className="text-xs text-gray-400">{agent.model}</span>
                      </div>
                    </div>
                  </div>
                  {agent.description && (
                    <p className="text-sm text-gray-500 mt-2">{agent.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>{agent._count?.conversations || 0} conversas</span>
                    <span>{agent._count?.knowledgeBases || 0} bases de conhecimento</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleActive(agent)}
                    className={`p-2 rounded-lg transition ${agent.isActive ? 'hover:bg-red-50 text-red-600' : 'hover:bg-green-50 text-green-600'}`}
                    title={agent.isActive ? 'Desativar' : 'Ativar'}
                  >
                    {agent.isActive ? <PowerOff size={18} /> : <Power size={18} />}
                  </button>
                  <button
                    onClick={() => navigate(`/agents/${agent.id}`)}
                    className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-600 transition"
                    title="Editar"
                  >
                    <ExternalLink size={18} />
                  </button>
                  <button
                    onClick={() => deleteAgent(agent.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition"
                    title="Deletar"
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

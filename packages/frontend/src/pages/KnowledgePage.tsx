import { useState, useEffect, useRef } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { toast } from 'sonner';
import api from '../services/api';
import { BookOpen, Plus, Trash2, FileText, Upload, File, X } from 'lucide-react';
import { getErrorMessage } from '../lib/errors';
import { askConfirm } from '../components/ui/ConfirmDialog';

interface Knowledge {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  content?: string;
  chunkCount: number;
  agentId: string;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
}

const FILE_TYPES: Record<string, { icon: typeof FileText; color: string }> = {
  pdf: { icon: FileText, color: 'text-[var(--color-error)]' },
  txt: { icon: File, color: 'text-[var(--text-secondary)]' },
  md: { icon: File, color: 'text-blue-600' },
  csv: { icon: File, color: 'text-green-600' },
  text: { icon: File, color: 'text-[var(--text-secondary)]' },
};

export default function KnowledgePage() {
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'text' | 'file'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.get('/knowledge'),
      api.get('/agents'),
    ]).then(([kbRes, agentsRes]) => {
      setKnowledge(kbRes.data);
      setAgents(agentsRes.data);
    }).catch(() => setError('Erro ao carregar'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreateText(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/knowledge', {
        agentId,
        content,
        fileName: fileName || 'texto-livre',
        fileType: 'text',
      });
      setKnowledge((prev) => [data, ...prev]);
      resetForm();
      toast.success('Conteúdo adicionado à base de conhecimento!');
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao criar'));
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadFile(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || !agentId) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('agentId', agentId);
      const { data } = await api.post('/knowledge', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setKnowledge((prev) => [data, ...prev]);
      resetForm();
      toast.success('Arquivo enviado!');
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao enviar arquivo'));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await askConfirm({ title: 'Excluir esta base de conhecimento?', confirmLabel: 'Confirmar', danger: true }))) return;
    try {
      await api.delete(`/knowledge/${id}`);
      toast.success('Removido com sucesso.');
      setKnowledge((prev) => prev.filter((kb) => kb.id !== id));
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erro ao deletar'));
    }
  }

  function resetForm() {
    setShowForm(false);
    setContent('');
    setFileName('');
    setAgentId('');
    setSelectedFile(null);
    setMode('file');
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-[var(--text-secondary)]">Carregando...</p></div>;

  return (
    <div>
      <PageHeader
        title="Base de conhecimento"
        description="Textos, arquivos e sites que os agentes usam para responder com mais precisão"
        actions={
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition">
            <Plus size={18} /> Adicionar conteúdo
          </button>
        }
      />

      {error && <div className="bg-[var(--color-error-bg)] border border-[var(--color-error-border)] text-[var(--color-error)] px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => resetForm()}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Adicionar Conteúdo</h2>
                <button onClick={resetForm} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]" aria-label="Fechar"><X size={20} /></button>
              </div>

              {/* Mode tabs */}
              <div className="flex gap-2 mb-4">
                <button onClick={() => setMode('file')} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition ${mode === 'file' ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-600)]' : 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'}`}>
                  <Upload size={16} /> Arquivo
                </button>
                <button onClick={() => setMode('text')} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition ${mode === 'text' ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-600)]' : 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'}`}>
                  <FileText size={16} /> Texto Livre
                </button>
              </div>

              {/* Agent select */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Agente *</label>
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)} required
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none text-sm">
                  <option value="">Selecione um agente</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              {mode === 'file' ? (
                <form onSubmit={handleUploadFile} className="space-y-4">
                  {/* Dropzone */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${selectedFile ? 'border-indigo-300 bg-[var(--color-primary-50)]' : 'border-[var(--border-color)] hover:border-indigo-400 hover:bg-[var(--surface-secondary)]'}`}
                  >
                    <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.csv" className="hidden"
                      onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])} />
                    {selectedFile ? (
                      <div>
                        <FileText size={32} className="mx-auto text-[var(--color-primary-500)] mb-2" />
                        <p className="font-medium text-[var(--text-primary)]">{selectedFile.name}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">{formatFileSize(selectedFile.size)}</p>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                          className="mt-2 text-xs text-[var(--color-error)] hover:underline">Remover</button>
                      </div>
                    ) : (
                      <div>
                        <Upload size={32} className="mx-auto text-[var(--text-tertiary)] mb-2" />
                        <p className="font-medium text-[var(--text-primary)]">Arraste um arquivo ou clique para selecionar</p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">PDF, TXT, MD ou CSV (máx. 10 MB)</p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={resetForm} className="px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] bg-[var(--surface-primary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--surface-secondary)] transition">Cancelar</button>
                    <button type="submit" disabled={uploading || !agentId || !selectedFile}
                      className="px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
                      {uploading ? 'Enviando...' : 'Enviar Arquivo'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleCreateText} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nome da fonte</label>
                    <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none text-sm"
                      placeholder="Ex: FAQ, Política de Trocas" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Conteúdo *</label>
                    <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={8}
                      className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none text-sm font-mono"
                      placeholder="Cole aqui o conteúdo, FAQ, políticas..." />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={resetForm} className="px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] bg-[var(--surface-primary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--surface-secondary)] transition">Cancelar</button>
                    <button type="submit" disabled={saving || !agentId || !content}
                      className="px-4 py-2.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Knowledge list */}
      {knowledge.length === 0 ? (
        <div className="text-center py-16 bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)]">
          <BookOpen size={48} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Nenhuma base de conhecimento</h3>
          <p className="text-[var(--text-secondary)] mt-1 mb-4">Adicione conteúdo para dar contexto aos seus agentes</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {knowledge.map((kb) => {
            const typeInfo = FILE_TYPES[kb.fileType] || FILE_TYPES.text;
            const TypeIcon = typeInfo.icon;
            return (
              <div key={kb.id} className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--color-info-bg)] flex items-center justify-center">
                      <TypeIcon size={20} className={typeInfo.color} />
                    </div>
                    <div>
                      <h3 className="font-medium text-[var(--text-primary)]">{kb.fileName}</h3>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {kb.fileType.toUpperCase()} · {kb.chunkCount} trechos · Agente: {agents.find((a) => a.id === kb.agentId)?.name || 'Desconhecido'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(kb.id)} className="p-2 rounded-lg hover:bg-[var(--color-error-bg)] text-red-400 transition">
                    <Trash2 size={16} />
                  </button>
                </div>
                {kb.content && (
                  <p className="text-sm text-[var(--text-secondary)] mt-3 line-clamp-2">{kb.content.slice(0, 200)}...</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

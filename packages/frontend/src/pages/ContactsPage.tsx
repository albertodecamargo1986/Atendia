import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '../services/api';
import {
  Contact, Search, Phone, Mail, Edit3, X, Save, ChevronRight, Plus,
  Building2, Briefcase, FileText, MapPin, MapPinned, Hash, Users,
  ShieldCheck, Loader2, CheckCircle, AlertCircle,
} from 'lucide-react';
import { maskPhone, maskCPFCNPJ, maskCEP } from '../lib/masks';
import { getErrorMessage } from '../lib/errors';

interface ContactData {
  id: string;
  name: string;
  phone: string;
  email: string;
  profilePicUrl: string | null;
  isGroup: boolean;
  cpfCnpj?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  company?: string;
  role?: string;
  notes?: string;
  createdAt: string;
  _count?: { tickets: number };
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', phone: '', email: '', cpfCnpj: '', address: '', city: '',
    state: '', zipCode: '', company: '', role: '', notes: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);

  useEffect(() => { fetchContacts(); }, [page, search]);

  async function fetchContacts() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('page', String(page));
      const { data } = await api.get(`/contacts?${params}`);
      setContacts(data.contacts || []);
      setTotal(data.count || 0);
      setHasMore(data.hasMore || false);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  }

  function handleCreateFormChange(field: string, value: string) {
    let masked = value;
    if (field === 'phone') masked = maskPhone(value);
    else if (field === 'cpfCnpj') masked = maskCPFCNPJ(value);
    else if (field === 'zipCode') masked = maskCEP(value);
    setCreateForm(f => ({ ...f, [field]: masked }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      await api.post('/contacts', createForm);
      toast.success('Salvo com sucesso!');
      setShowCreate(false);
      setCreateForm({ name: '', phone: '', email: '', cpfCnpj: '', address: '', city: '', state: '', zipCode: '', company: '', role: '', notes: '' });
      fetchContacts();
    } catch (err: any) {
      setCreateError(getErrorMessage(err, 'Erro ao criar contato'));
    }
    finally { setCreating(false); }
  }

  async function fetchDetail(id: string) {
    try {
      const { data } = await api.get(`/contacts/${id}`);
      setDetail(data);
      setEditData({
        name: data.name, email: data.email, cpfCnpj: data.cpfCnpj || '',
        address: data.address || '', city: data.city || '', state: data.state || '',
        zipCode: data.zipCode || '', company: data.company || '', role: data.role || '',
        notes: data.notes || '',
      });
    } catch (err) { toast.error(getErrorMessage(err)); }
  }

  function handleEditChange(field: string, value: string) {
    let masked = value;
    if (field === 'phone') masked = maskPhone(value);
    else if (field === 'cpfCnpj') masked = maskCPFCNPJ(value);
    else if (field === 'zipCode') masked = maskCEP(value);
    setEditData((d: any) => ({ ...d, [field]: masked }));
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.patch(`/contacts/${selectedId}`, editData);
      toast.success('Alterações salvas!');
      setEditing(false);
      setEditSuccess(true);
      setTimeout(() => setEditSuccess(false), 3000);
      fetchDetail(selectedId);
      fetchContacts();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setEditing(false);
    fetchDetail(id);
  }

  function formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  return (
    <div className="flex h-[calc(100vh-5rem)]">
      {/* List */}
      <div className="w-96 border-r border-[var(--border-color)] bg-[var(--surface-primary)] flex flex-col">
        <div className="p-4 border-b border-[var(--border-color)]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">Contatos</h1>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{total} contato{total !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary-500)] hover:bg-[var(--color-primary-600)] text-white text-xs font-medium rounded-lg transition">
              <Plus size={14} /> Novo
            </button>
          </div>
          <div className="relative mt-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar nome, telefone, CPF..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-[var(--color-primary-500)] outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-[var(--text-tertiary)] flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Carregando...
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-8 text-center">
              <Contact size={40} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-tertiary)]">Nenhum contato encontrado</p>
              <button onClick={() => setShowCreate(true)}
                className="mt-3 text-sm text-[var(--color-primary-500)] hover:text-[var(--color-primary-600)] font-medium">
                Criar primeiro contato
              </button>
            </div>
          ) : (
            contacts.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c.id)}
                className={`w-full text-left p-4 border-b border-[var(--border-color)] hover:bg-[var(--surface-secondary)] transition ${
                  selectedId === c.id ? 'bg-[var(--color-primary-50)] border-l-2 border-l-indigo-600' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--surface-tertiary)] flex items-center justify-center shrink-0 text-sm font-medium text-[var(--text-secondary)]">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-[var(--text-primary)] truncate">{c.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">{formatPhone(c.phone)}</p>
                    {c.company && <p className="text-xs text-[var(--text-tertiary)] truncate">{c.company}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {c.isGroup && <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-info-bg)] text-blue-600">Grupo</span>}
                    {(c._count?.tickets || 0) > 0 && (
                      <span className="text-xs text-[var(--text-tertiary)]">{c._count?.tickets} atendimento{c._count?.tickets !== 1 ? 's' : ''}</span>
                    )}
                    <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {hasMore && (
          <div className="p-3 border-t border-[var(--border-color)] text-center">
            <button onClick={() => setPage(p => p + 1)} className="text-sm text-[var(--color-primary-500)] hover:text-[var(--color-primary-600)] font-medium">
              Carregar mais contatos
            </button>
          </div>
        )}
      </div>

      {/* Detail */}
      <div className="flex-1 bg-[var(--surface-secondary)] overflow-y-auto">
        {detail ? (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-[var(--surface-tertiary)] flex items-center justify-center text-2xl font-medium text-[var(--text-secondary)] shrink-0">
                  {detail.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Nome *</label>
                        <input type="text" value={editData.name || ''}
                          onChange={e => setEditData((d: any) => ({ ...d, name: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                          placeholder="Nome completo" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">E-mail</label>
                        <input type="email" value={editData.email || ''}
                          onChange={e => setEditData((d: any) => ({ ...d, email: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                          placeholder="email@exemplo.com" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">CPF/CNPJ</label>
                        <input type="text" value={editData.cpfCnpj || ''}
                          onChange={e => handleEditChange('cpfCnpj', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                          placeholder="000.000.000-00" />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Endereço</label>
                          <input type="text" value={editData.address || ''}
                            onChange={e => setEditData((d: any) => ({ ...d, address: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">CEP</label>
                          <input type="text" value={editData.zipCode || ''}
                            onChange={e => handleEditChange('zipCode', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                            placeholder="00000-000" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Cidade</label>
                          <input type="text" value={editData.city || ''}
                            onChange={e => setEditData((d: any) => ({ ...d, city: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Estado</label>
                          <input type="text" value={editData.state || ''}
                            onChange={e => setEditData((d: any) => ({ ...d, state: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                            placeholder="SP" maxLength={2} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Empresa</label>
                          <input type="text" value={editData.company || ''}
                            onChange={e => setEditData((d: any) => ({ ...d, company: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Cargo</label>
                          <input type="text" value={editData.role || ''}
                            onChange={e => setEditData((d: any) => ({ ...d, role: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Observações</label>
                        <textarea value={editData.notes || ''}
                          onChange={e => setEditData((d: any) => ({ ...d, notes: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                          rows={3} placeholder="Informações adicionais..." />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button onClick={handleSave} disabled={saving}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-primary-500)] text-white text-xs font-medium rounded-lg hover:bg-[var(--color-primary-600)] disabled:opacity-50 transition">
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button onClick={() => setEditing(false)}
                          className="px-3 py-1.5 text-xs text-[var(--text-secondary)] bg-[var(--surface-tertiary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">
                          Cancelar
                        </button>
                        {editSuccess && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle size={12} /> Salvo!
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-[var(--text-primary)]">{detail.name}</h2>
                        <button onClick={() => setEditing(true)}
                          className="p-1.5 rounded-lg hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--color-primary-500)] transition" title="Editar" aria-label="Editar">
                          <Edit3 size={14} />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-[var(--text-secondary)]">
                        <span className="flex items-center gap-1"><Phone size={14} /> {formatPhone(detail.phone)}</span>
                        {detail.email && <span className="flex items-center gap-1"><Mail size={14} /> {detail.email}</span>}
                      </div>
                      {detail.isGroup && (
                        <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-[var(--color-info-bg)] text-blue-600 flex items-center gap-1 w-fit">
                          <Users size={12} /> Grupo
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Info */}
            {!editing && (
              <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Informações Adicionais</h3>
                {!detail.cpfCnpj && !detail.company && !detail.address && !detail.notes ? (
                  <p className="text-sm text-[var(--text-tertiary)]">Nenhuma informação adicional registrada.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {detail.cpfCnpj && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1"><ShieldCheck size={12} /> CPF/CNPJ</p>
                        <p className="text-sm text-[var(--text-primary)] mt-0.5">{maskCPFCNPJ(detail.cpfCnpj)}</p>
                      </div>
                    )}
                    {detail.company && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1"><Building2 size={12} /> Empresa</p>
                        <p className="text-sm text-[var(--text-primary)] mt-0.5">{detail.company}</p>
                      </div>
                    )}
                    {detail.role && (
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1"><Briefcase size={12} /> Cargo</p>
                        <p className="text-sm text-[var(--text-primary)] mt-0.5">{detail.role}</p>
                      </div>
                    )}
                    {detail.cpfCnpj && !detail.company && !detail.role && <div />}
                    <div className="col-span-2">
                      <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1"><MapPin size={12} /> Endereço</p>
                      <p className="text-sm text-[var(--text-primary)] mt-0.5">
                        {[detail.address, detail.city, detail.state, detail.zipCode].filter(Boolean).join(', ') || '—'}
                      </p>
                    </div>
                    {detail.notes && (
                      <div className="col-span-2">
                        <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1"><FileText size={12} /> Observações</p>
                        <p className="text-sm text-[var(--text-primary)] mt-0.5 whitespace-pre-wrap">{detail.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Ticket history */}
            <div className="bg-[var(--surface-primary)] rounded-xl border border-[var(--border-color)] p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-4">Histórico de atendimentos</h3>
              {detail.tickets?.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)]">Nenhum atendimento para este contato</p>
              ) : (
                <div className="space-y-3">
                  {detail.tickets?.map((t: any) => {
                    const statusCfg: Record<string, { label: string; color: string }> = {
                      PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700' },
                      OPEN: { label: 'Atendimento', color: 'bg-green-100 text-[var(--color-success)]' },
                      CLOSED: { label: 'Fechado', color: 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]' },
                    };
                    const sc = statusCfg[t.status] || statusCfg.PENDING;
                    return (
                      <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-secondary)] transition">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[var(--text-primary)] truncate">{t.lastMessage || 'Sem mensagem'}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            {new Date(t.updatedAt).toLocaleString('pt-BR')}
                            {t.assignee && <span> · {t.assignee.name}</span>}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sc.color} ml-3 whitespace-nowrap`}>{sc.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center h-full text-[var(--text-tertiary)]">
            <div className="text-center">
              <Contact size={48} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
              <p className="text-sm">Selecione um contato</p>
              <p className="text-xs mt-1">ou crie um novo contato</p>
              <button onClick={() => setShowCreate(true)}
                className="mt-3 text-sm text-[var(--color-primary-500)] hover:text-[var(--color-primary-600)] font-medium flex items-center gap-1 justify-center">
                <Plus size={14} /> Novo Contato
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-[var(--surface-primary)] rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Novo Contato</h2>
                <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]" aria-label="Fechar"><X size={20} /></button>
              </div>

              {createError && (
                <div className="mb-4 p-3 bg-[var(--color-error-bg)] border border-[var(--color-error-border)] text-[var(--color-error)] text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle size={14} /> {createError}
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Nome *</label>
                    <input type="text" required value={createForm.name}
                      onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                      placeholder="Nome do contato" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Telefone *</label>
                    <input type="text" required value={createForm.phone}
                      onChange={e => handleCreateFormChange('phone', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                      placeholder="(11) 99999-9999" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">E-mail</label>
                  <input type="email" value={createForm.email}
                    onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    placeholder="email@exemplo.com" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">CPF/CNPJ</label>
                    <div className="relative">
                      <ShieldCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                      <input type="text" value={createForm.cpfCnpj}
                        onChange={e => handleCreateFormChange('cpfCnpj', e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                        placeholder="000.000.000-00" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">CEP</label>
                    <div className="relative">
                      <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                      <input type="text" value={createForm.zipCode}
                        onChange={e => handleCreateFormChange('zipCode', e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                        placeholder="00000-000" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Endereço</label>
                  <div className="relative">
                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    <input type="text" value={createForm.address}
                      onChange={e => setCreateForm(f => ({ ...f, address: e.target.value }))}
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                      placeholder="Rua, número, bairro" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Cidade</label>
                    <div className="relative">
                      <MapPinned size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                      <input type="text" value={createForm.city}
                        onChange={e => setCreateForm(f => ({ ...f, city: e.target.value }))}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                        placeholder="São Paulo" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Estado</label>
                    <input type="text" value={createForm.state}
                      onChange={e => setCreateForm(f => ({ ...f, state: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                      placeholder="SP" maxLength={2} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Empresa</label>
                    <div className="relative">
                      <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                      <input type="text" value={createForm.company}
                        onChange={e => setCreateForm(f => ({ ...f, company: e.target.value }))}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                        placeholder="Nome da empresa" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Cargo</label>
                    <div className="relative">
                      <Briefcase size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                      <input type="text" value={createForm.role}
                        onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                        placeholder="Cargo do contato" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Observações</label>
                  <textarea value={createForm.notes}
                    onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-color)] text-sm focus:ring-2 focus:ring-[var(--color-primary-500)] outline-none"
                    rows={2} placeholder="Informações adicionais..." />
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border-color)]">
                  <button type="button" onClick={() => setShowCreate(false)}
                    className="px-4 py-2 text-sm text-[var(--text-primary)] bg-[var(--surface-tertiary)] rounded-lg hover:bg-[var(--surface-tertiary)] transition">
                    Cancelar
                  </button>
                  <button type="submit" disabled={creating || !createForm.name.trim() || !createForm.phone.trim()}
                    className="px-4 py-2 bg-[var(--color-primary-500)] text-white text-sm font-medium rounded-lg hover:bg-[var(--color-primary-600)] disabled:opacity-50 transition flex items-center gap-2">
                    {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {creating ? 'Salvando...' : 'Criar Contato'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

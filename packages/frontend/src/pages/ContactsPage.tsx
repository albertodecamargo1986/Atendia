import { useState, useEffect } from 'react';
import api from '../services/api';
import { Contact, Search, Phone, Mail, Edit3, X, Save, ChevronRight } from 'lucide-react';

interface ContactData {
  id: string;
  name: string;
  phone: string;
  email: string;
  profilePicUrl: string | null;
  isGroup: boolean;
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

  // Edit
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

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
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function fetchDetail(id: string) {
    try {
      const { data } = await api.get(`/contacts/${id}`);
      setDetail(data);
      setEditName(data.name);
      setEditEmail(data.email);
    } catch { /* ignore */ }
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.patch(`/contacts/${selectedId}`, { name: editName, email: editEmail });
      setEditing(false);
      fetchDetail(selectedId);
      fetchContacts();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setEditing(false);
    fetchDetail(id);
  }

  return (
    <div className="flex h-[calc(100vh-5rem)]">
      {/* List */}
      <div className="w-96 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold text-gray-900">Contatos</h1>
          <p className="text-xs text-gray-400 mt-0.5">{total} contato{total !== 1 ? 's' : ''}</p>
          <div className="relative mt-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar nome ou telefone..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-400">Carregando...</div>
          ) : contacts.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">Nenhum contato</div>
          ) : (
            contacts.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c.id)}
                className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition ${
                  selectedId === c.id ? 'bg-indigo-50 border-l-2 border-l-indigo-600' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-sm font-medium text-gray-600">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.phone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.isGroup && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Grupo</span>}
                    {(c._count?.tickets || 0) > 0 && (
                      <span className="text-xs text-gray-400">{c._count?.tickets} ticket{c._count?.tickets !== 1 ? 's' : ''}</span>
                    )}
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {hasMore && (
          <div className="p-3 border-t border-gray-200 text-center">
            <button onClick={() => setPage(p => p + 1)} className="text-sm text-indigo-600 hover:text-indigo-700">Carregar mais</button>
          </div>
        )}
      </div>

      {/* Detail */}
      <div className="flex-1 bg-gray-50 overflow-y-auto">
        {detail ? (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-medium text-gray-600 shrink-0">
                  {detail.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Nome"
                      />
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="E-mail"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleSave} disabled={saving}
                          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                          <Save size={12} /> {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button onClick={() => setEditing(false)}
                          className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-gray-900">{detail.name}</h2>
                        <button onClick={() => setEditing(true)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition" title="Editar">
                          <Edit3 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1"><Phone size={14} /> {detail.phone}</span>
                        {detail.email && <span className="flex items-center gap-1"><Mail size={14} /> {detail.email}</span>}
                      </div>
                      {detail.isGroup && (
                        <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Grupo</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Ticket history */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Histórico de Tickets</h3>
              {detail.tickets?.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum ticket para este contato</p>
              ) : (
                <div className="space-y-3">
                  {detail.tickets?.map((t: any) => {
                    const statusCfg: Record<string, { label: string; color: string }> = {
                      PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700' },
                      OPEN: { label: 'Atendimento', color: 'bg-green-100 text-green-700' },
                      CLOSED: { label: 'Fechado', color: 'bg-gray-100 text-gray-600' },
                    };
                    const sc = statusCfg[t.status] || statusCfg.PENDING;
                    return (
                      <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{t.lastMessage || 'Sem mensagem'}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(t.updatedAt).toLocaleString('pt-BR')}
                            {t.assignee && <span> · {t.assignee.name}</span>}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sc.color} ml-3`}>{sc.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <Contact size={48} className="mx-auto mb-3 text-gray-300" />
              <p>Selecione um contato</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

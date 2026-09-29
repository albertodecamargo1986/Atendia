import { useState, useEffect } from 'react';
import api from '../services/api';

interface Tag {
  id: string;
  name: string;
  color: string;
  _count?: { tickets: number };
}

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchTags() {
    try {
      const { data } = await api.get('/tags');
      setTags(Array.isArray(data) ? data : []);
    } catch {
      // Etiquetas podem não estar no plano: a lista fica vazia
      setTags([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTags(); }, []);

  /** Lança erro em caso de falha (quem chama mostra a mensagem). */
  async function addTagToTicket(ticketId: string, tagId: string) {
    await api.post(`/tags/ticket/${ticketId}`, { tagId });
  }

  /** Lança erro em caso de falha (quem chama mostra a mensagem). */
  async function removeTagFromTicket(ticketId: string, tagId: string) {
    await api.delete(`/tags/ticket/${ticketId}/${tagId}`);
  }

  return { tags, loading, addTagToTicket, removeTagFromTicket, refresh: fetchTags };
}

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
      setTags(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchTags(); }, []);

  async function addTagToTicket(ticketId: string, tagId: string) {
    try {
      await api.post(`/tags/ticket/${ticketId}`, { tagId });
    } catch { /* ignore */ }
  }

  async function removeTagFromTicket(ticketId: string, tagId: string) {
    try {
      await api.delete(`/tags/ticket/${ticketId}/${tagId}`);
    } catch { /* ignore */ }
  }

  return { tags, loading, addTagToTicket, removeTagFromTicket, refresh: fetchTags };
}

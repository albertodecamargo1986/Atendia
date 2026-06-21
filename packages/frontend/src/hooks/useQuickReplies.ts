import { useState, useEffect } from 'react';
import api from '../services/api';

interface QuickReply {
  id: string;
  shortcode: string;
  content: string;
  category: string | null;
}

export function useQuickReplies() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchReplies() {
    try {
      const res = await api.get('/quick-replies');
      const data = res.data;
      setReplies(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchReplies(); }, []);

  return { replies, loading, refresh: fetchReplies };
}

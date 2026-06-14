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
      const { data } = await api.get('/quick-replies');
      setReplies(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchReplies(); }, []);

  return { replies, loading, refresh: fetchReplies };
}

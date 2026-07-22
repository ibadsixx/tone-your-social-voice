import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';

interface HashtagSearchResult {
  id: string;
  tag: string;
  follower_count: number;
  post_count?: number;
}

export const useHashtagSearch = (query: string, limit: number = 10) => {
  const [results, setResults] = useState<HashtagSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const searchHashtags = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const searchTerm = query.startsWith('#') ? query.slice(1) : query;
        
        // Use fuzzy search with pg_trgm
        const { data, error } = await gateway
          .from('hashtags' as any)
          .select('id, tag, follower_count')
          .ilike('tag', `%${searchTerm}%`)
          .order('follower_count', { ascending: false })
          .limit(limit);

        if (error) throw error;
        setResults((data as any[]) || []);
      } catch (error) {
        console.error('Error searching hashtags:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchHashtags, 300);
    return () => clearTimeout(timeoutId);
  }, [query, limit]);

  return { results, loading };
};

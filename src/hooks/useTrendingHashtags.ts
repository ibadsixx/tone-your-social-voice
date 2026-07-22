import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';

interface TrendingHashtag {
  tag: string;
  count: number;
}

export const useTrendingHashtags = (limit: number = 5) => {
  const [hashtags, setHashtags] = useState<TrendingHashtag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrendingHashtags = async () => {
      try {
        setLoading(true);

        // Get the timestamp for 24 hours ago
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        // Query hashtag_links from the last 24 hours, grouped by hashtag_id
        const { data: links, error: linksError } = await gateway
          .from('hashtag_links' as any)
          .select('hashtag_id')
          .gte('created_at', yesterday.toISOString());

        if (linksError) {
          console.error('Error fetching hashtag links:', linksError);
          setHashtags([]);
          return;
        }

        if (!links || links.length === 0) {
          setHashtags([]);
          return;
        }

        // Count occurrences of each hashtag_id
        const hashtagCounts = links.reduce((acc: Record<string, number>, link: any) => {
          acc[link.hashtag_id] = (acc[link.hashtag_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        // Get top hashtag IDs
        const topHashtagIds = Object.entries(hashtagCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, limit)
          .map(([id]) => id);

        if (topHashtagIds.length === 0) {
          setHashtags([]);
          return;
        }

        // Fetch hashtag details
        const { data: hashtagsData, error: hashtagsError } = await gateway
          .from('hashtags' as any)
          .select('id, tag')
          .in('id', topHashtagIds);

        if (hashtagsError) {
          console.error('Error fetching hashtags:', hashtagsError);
          setHashtags([]);
          return;
        }

        // Combine hashtags with their counts
        const trending = (hashtagsData as any[]).map((hashtag: any) => ({
          tag: hashtag.tag,
          count: hashtagCounts[hashtag.id],
        })).sort((a, b) => b.count - a.count);

        setHashtags(trending);
      } catch (error) {
        console.error('Error in fetchTrendingHashtags:', error);
        setHashtags([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTrendingHashtags();
  }, [limit]);

  return { hashtags, loading };
};

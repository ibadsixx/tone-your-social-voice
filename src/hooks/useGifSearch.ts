import { useState, useCallback } from 'react';
import { gateway } from '@/lib/gateway';

export interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

export const useGifSearch = () => {
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchGifs = useCallback(async (query: string, limit: number = 20) => {
    if (!query.trim()) {
      // If no query, fetch trending GIFs
      return fetchTrendingGifs(limit);
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await gateway.functions.invoke('search-gifs', {
        body: { query, limit }
      });

      if (error) throw error;

      const transformedGifs: GifItem[] = data.gifs.map((gif: any) => ({
        id: gif.id,
        title: gif.title || 'GIF',
        url: gif.images.fixed_height.mp4 || gif.images.fixed_height.url,
        previewUrl: gif.images.fixed_height_small.url,
        width: parseInt(gif.images.fixed_height.width),
        height: parseInt(gif.images.fixed_height.height)
      }));

      setGifs(transformedGifs);
    } catch (err: any) {
      setError(err.message || 'Failed to search GIFs');
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrendingGifs = useCallback(async (limit: number = 20) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await gateway.functions.invoke('search-gifs', {
        body: { trending: true, limit }
      });

      if (error) throw error;

      const transformedGifs: GifItem[] = data.gifs.map((gif: any) => ({
        id: gif.id,
        title: gif.title || 'GIF',
        url: gif.images.fixed_height.mp4 || gif.images.fixed_height.url,
        previewUrl: gif.images.fixed_height_small.url,
        width: parseInt(gif.images.fixed_height.width),
        height: parseInt(gif.images.fixed_height.height)
      }));

      setGifs(transformedGifs);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch trending GIFs');
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    gifs,
    loading,
    error,
    searchGifs,
    fetchTrendingGifs
  };
};
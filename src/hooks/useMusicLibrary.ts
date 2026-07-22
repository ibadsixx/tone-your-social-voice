import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { detectMusicUrl } from '@/utils/musicUrlDetector';
import { useAuth } from '@/hooks/useAuth';

export interface MusicTrack {
  id: string;
  url: string;
  title: string;
  artist: string | null;
  duration: number | null;
  source_type: string;
  thumbnail_url: string | null;
  video_id: string | null;
  usage_count: number;
  is_trending: boolean;
  created_at: string;
  start_at?: number;
  weekly_usage?: number;
}

interface AddMusicParams {
  url: string;
  title: string;
  artist?: string;
  duration?: number;
  thumbnail_url?: string;
}

interface MusicLibraryResponse {
  success: boolean;
  data: MusicTrack[];
  total?: number;
}

interface MusicAddResponse {
  success: boolean;
  data: MusicTrack;
}

export const useMusicLibrary = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch music library with stats using new RPC function
  const { data: libraryData, isLoading } = useQuery({
    queryKey: ['music-library'],
    queryFn: async () => {
      console.log('[Music Library] Fetching library with stats...');
      
      const { data, error } = await gateway
        .rpc('get_music_library_with_stats', { p_limit: 100, p_offset: 0 });
      
      if (error) {
        console.error('[Music Library] RPC error:', error);
        throw error;
      }
      
      console.log('[Music Library] Raw response:', data);
      
      // The RPC returns a JSON object with success and data
      const response = data as unknown as MusicLibraryResponse;
      
      if (!response?.success) {
        throw new Error('Failed to fetch music library');
      }
      
      return response.data || [];
    },
  });

  const tracks = libraryData || [];

  // Add or increment music using new RPC function
  const addOrIncrementMutation = useMutation({
    mutationFn: async (params: AddMusicParams): Promise<MusicTrack> => {
      console.log('[Music Library] ========== START ADD/INCREMENT ==========');
      console.log('[Music Library] Input params:', params);

      // Validate URL
      const urlInfo = detectMusicUrl(params.url);
      console.log('[Music Library] URL validation result:', urlInfo);
      
      if (!urlInfo.isValid) {
        console.error('[Music Library] Invalid URL:', params.url, urlInfo.error);
        throw new Error(urlInfo.error || 'Invalid music URL');
      }

      // Call the new RPC function that returns proper JSON
      const { data, error } = await gateway.rpc('add_or_increment_music', {
        p_url: params.url,
        p_title: params.title,
        p_artist: params.artist || null,
        p_duration: params.duration || 15,
        p_source_type: urlInfo.type,
        p_video_id: urlInfo.videoId || null,
        p_thumbnail_url: params.thumbnail_url || null,
        p_user_id: user?.id || null,
      });

      console.log('[Music Library] RPC response:', { data, error });

      if (error) {
        console.error('[Music Library] RPC failed:', error);
        throw new Error(`Failed to add music: ${error.message}`);
      }

      // Parse the JSON response
      const response = data as unknown as MusicAddResponse;
      
      if (!response?.success || !response?.data) {
        console.error('[Music Library] Invalid response format:', response);
        throw new Error('Failed to add music - invalid response');
      }

      console.log('[Music Library] Successfully added/incremented music:', response.data);
      console.log('[Music Library] ========== END ADD/INCREMENT ==========');
      
      return response.data;
    },
    onSuccess: (data) => {
      console.log('[Music Library] Mutation successful:', data.title);
      queryClient.invalidateQueries({ queryKey: ['music-library'] });
      queryClient.invalidateQueries({ queryKey: ['music-trending'] });
      toast({
        title: 'Music added',
        description: `"${data.title}" added to library`,
      });
    },
    onError: (error: Error) => {
      console.error('[Music Library] Mutation error:', error);
      toast({
        title: 'Failed to add music',
        description: error.message || 'An unknown error occurred',
        variant: 'destructive',
      });
    },
  });

  // Fetch trending music
  const { data: trendingData = [] } = useQuery({
    queryKey: ['music-trending'],
    queryFn: async () => {
      console.log('[Music Library] Fetching trending music...');
      
      const { data, error } = await gateway
        .rpc('get_trending_music', { p_limit: 10 });
      
      if (error) {
        console.error('[Music Library] Trending RPC error:', error);
        throw error;
      }
      
      const response = data as unknown as MusicLibraryResponse;
      
      if (!response?.success) {
        return [];
      }
      
      return response.data || [];
    },
  });

  // Weekly top tracks (same as trending but more)
  const { data: weeklyTopTracks = [] } = useQuery({
    queryKey: ['music-library-weekly'],
    queryFn: async () => {
      const { data, error } = await gateway
        .rpc('get_trending_music', { p_limit: 20 });
      
      if (error) {
        console.error('[Music Library] Weekly RPC error:', error);
        throw error;
      }
      
      const response = data as unknown as MusicLibraryResponse;
      return response?.data || [];
    },
  });

  const trendingTracks = trendingData.filter((t: MusicTrack) => t.is_trending || (t.weekly_usage && t.weekly_usage > 0));
  const popularTracks = tracks.slice(0, 20);

  return {
    tracks,
    trendingTracks,
    popularTracks,
    weeklyTopTracks,
    isLoading,
    addOrIncrement: addOrIncrementMutation.mutateAsync,
    isAdding: addOrIncrementMutation.isPending,
  };
};
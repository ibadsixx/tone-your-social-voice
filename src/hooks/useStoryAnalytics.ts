import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

export interface StoryView {
  id: string;
  story_id: string;
  viewer_id: string;
  viewed_at: string;
  viewer?: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

export const useStoryAnalytics = (storyId: string) => {
  const [views, setViews] = useState<StoryView[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchViews = async () => {
    try {
      setLoading(true);
      const { data: viewsData, error } = await gateway
        .from('story_views')
        .select('*')
        .eq('story_id', storyId)
        .order('viewed_at', { ascending: false });

      if (error) throw error;

      // Fetch viewer profiles separately
      const viewerIds = viewsData?.map(v => v.viewer_id) || [];
      const { data: profiles } = await gateway
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', viewerIds);

      // Combine views with profile data
      const viewsWithProfiles = viewsData?.map(view => ({
        ...view,
        viewer: profiles?.find(p => p.id === view.viewer_id) || {
          username: 'Unknown',
          display_name: 'Unknown User',
          profile_pic: null
        }
      })) || [];

      setViews(viewsWithProfiles as StoryView[]);
    } catch (error: any) {
      console.error('Error fetching story views:', error);
      toast({
        title: 'Error',
        description: 'Failed to load story analytics',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (storyId) {
      fetchViews();
    }
  }, [storyId]);

  return {
    views,
    loading,
    refetch: fetchViews
  };
};

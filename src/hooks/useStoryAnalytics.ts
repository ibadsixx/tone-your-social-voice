import { useState, useEffect, useCallback } from 'react';
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

export interface StoryReactionAnalytics {
  id: string;
  story_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
}

const UNKNOWN_PROFILE = { username: 'Unknown', display_name: 'Unknown User', profile_pic: null };

/**
 * Owner-only Story analytics (do.md sections 4-6/10): total views (from the
 * existing story_views tracking — a view counts even without a reaction) and
 * the full reaction list with the exact reaction each user selected. The
 * Gateway enforces that only the Story owner can read these rows.
 */
export const useStoryAnalytics = (storyId: string) => {
  const [views, setViews] = useState<StoryView[]>([]);
  const [reactions, setReactions] = useState<StoryReactionAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);

      const [viewsResponse, reactionsResponse] = await Promise.all([
        gateway
          .from('story_views')
          .select('*')
          .eq('story_id', storyId)
          .order('viewed_at', { ascending: false }),
        gateway
          .from('story_reactions')
          .select('*')
          .eq('story_id', storyId)
          .order('created_at', { ascending: false }),
      ]);

      if (viewsResponse.error) throw viewsResponse.error;
      if (reactionsResponse.error) throw reactionsResponse.error;

      const viewsData = (viewsResponse.data || []) as StoryView[];
      const reactionsData = (reactionsResponse.data || []) as StoryReactionAnalytics[];

      // Fetch profiles for viewers + reactors in one targeted query.
      const profileIds = [
        ...viewsData.map((v) => v.viewer_id),
        ...reactionsData.map((r) => r.user_id),
      ].filter((id): id is string => typeof id === 'string');
      const uniqueProfileIds = [...new Set(profileIds)];

      const { data: profilesData, error: profilesError } = uniqueProfileIds.length
        ? await gateway
            .from('profiles')
            .select('id, username, display_name, profile_pic')
            .in('id', uniqueProfileIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      const profiles = (profilesData || []) as ProfileRow[];

      const profileFor = (id: string) =>
        profiles.find((p) => p.id === id) || UNKNOWN_PROFILE;

      // Combine views with profile data
      const viewsWithProfiles = viewsData.map((view) => ({
        ...view,
        viewer: profileFor(view.viewer_id),
      }));

      // Combine reactions with the profile of each user who reacted, keeping
      // the exact reaction each user selected (do.md section 4).
      const reactionsWithProfiles = reactionsData.map((reaction) => ({
        ...reaction,
        user: profileFor(reaction.user_id),
      }));

      setViews(viewsWithProfiles);
      setReactions(reactionsWithProfiles);
    } catch (error: unknown) {
      console.error('Error fetching story analytics:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load story analytics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [storyId, toast]);

  useEffect(() => {
    if (storyId) {
      fetchAnalytics();
    }
  }, [storyId, fetchAnalytics]);

  return {
    views,
    reactions,
    loading,
    refetch: fetchAnalytics,
  };
};
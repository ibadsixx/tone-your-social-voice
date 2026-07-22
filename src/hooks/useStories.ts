import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  duration: number; // Story display duration in seconds
  music_url: string | null;
  music_title: string | null;
  music_start_at?: number | null;
  music_duration?: number | null;
  music_source_type?: string | null;
  music_video_id?: string | null;
  music_thumbnail_url?: string | null;
  created_at: string;
  expires_at: string;
  views: number;
  viewed_by: string[];
  privacy: 'public' | 'friends' | 'close_friends' | 'private';
  profiles?: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

export interface GroupedStories {
  user_id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  stories: Story[];
}

export const useStories = () => {
  const [stories, setStories] = useState<GroupedStories[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchStories = async (opts?: { showLoading?: boolean }) => {
    const showLoading = opts?.showLoading ?? stories.length === 0;

    try {
      if (showLoading) setLoading(true);

      // If user is not authenticated, return empty stories (stories require auth to view)
      if (!user) {
        setStories([]);
        if (showLoading) setLoading(false);
        return;
      }

      const { data, error } = await gateway
        .from('stories')
        .select(`
          *,
          profiles:user_id (
            username,
            display_name,
            profile_pic
          )
        `)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Supabase stories query error:', error);
        throw error;
      }

      // Group stories by user and sort stories within each group
      const grouped = (data || []).reduce((acc: GroupedStories[], story: any) => {
        const existingUser = acc.find(g => g.user_id === story.user_id);

        if (existingUser) {
          existingUser.stories.push(story);
        } else {
          acc.push({
            user_id: story.user_id,
            username: story.profiles?.username || 'Unknown',
            display_name: story.profiles?.display_name || 'Unknown',
            profile_pic: story.profiles?.profile_pic,
            stories: [story]
          });
        }

        return acc;
      }, []);

      // Sort stories within each user group by created_at (oldest first)
      grouped.forEach(group => {
        group.stories.sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });

      setStories(grouped);
    } catch (error: any) {
      console.error('Error fetching stories:', error);
      // Only show error toast if user is authenticated (otherwise it's expected to be empty)
      if (user) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to load stories. Please try again.',
          variant: 'destructive'
        });
      }
      setStories([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const createStory = async (
    file: File, 
    caption?: string, 
    musicUrl?: string, 
    musicTitle?: string, 
    privacy: 'public' | 'friends' | 'close_friends' | 'private' = 'public',
    musicSegment?: {
      startAt: number;
      duration: number;
      source_type: string;
      video_id?: string;
      thumbnail_url?: string;
    }
  ) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to create a story',
        variant: 'destructive'
      });
      return null;
    }

    try {
      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

      const { error: uploadError } = await gateway.storage
        .from('stories')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = gateway.storage
        .from('stories')
        .getPublicUrl(fileName);

      // Create story record
      const { data, error } = await gateway
        .from('stories')
        .insert({
          user_id: user.id,
          media_url: publicUrl,
          media_type: mediaType,
          caption: caption || null,
          music_url: musicUrl || null,
          music_title: musicTitle || null,
          music_start_at: musicSegment?.startAt || null,
          music_duration: musicSegment?.duration || null,
          music_source_type: musicSegment?.source_type || null,
          music_video_id: musicSegment?.video_id || null,
          music_thumbnail_url: musicSegment?.thumbnail_url || null,
          privacy: privacy
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Story created successfully'
      });

      fetchStories({ showLoading: false });
      return data;
    } catch (error: any) {
      console.error('Error creating story:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create story',
        variant: 'destructive'
      });
      return null;
    }
  };

  const markAsViewed = async (storyId: string) => {
    if (!user) return;

    try {
      // Insert into story_views table (will be unique per user per story)
      const { error } = await gateway
        .from('story_views')
        .insert({
          story_id: storyId,
          viewer_id: user.id
        });

      // Ignore unique constraint violations (user already viewed)
      if (error && !error.message.includes('duplicate key')) {
        throw error;
      }

      // Update story views count
      const { error: updateError } = await gateway
        .from('stories')
        .update({
          views: await getViewCount(storyId)
        })
        .eq('id', storyId);

      if (updateError) throw updateError;
    } catch (error: any) {
      console.error('Error marking story as viewed:', error);
    }
  };

  const getViewCount = async (storyId: string): Promise<number> => {
    const { count } = await gateway
      .from('story_views')
      .select('*', { count: 'exact', head: true })
      .eq('story_id', storyId);
    
    return count || 0;
  };

  const deleteStory = async (storyId: string) => {
    try {
      const { error } = await gateway
        .from('stories')
        .delete()
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Story deleted successfully'
      });

      fetchStories({ showLoading: false });
    } catch (error: any) {
      console.error('Error deleting story:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete story',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    // Only fetch stories if user is authenticated
    if (!user) {
      setStories([]);
      setLoading(false);
      return;
    }
    
    fetchStories({ showLoading: true });

    // Real-time subscription (do NOT toggle global loading; it would unmount StoryViewer)
    const channel = gateway
      .channel('stories-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories'
        },
        () => {
          fetchStories({ showLoading: false });
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [user]);

  return {
    stories,
    loading,
    createStory,
    markAsViewed,
    deleteStory,
    refetch: fetchStories
  };
};

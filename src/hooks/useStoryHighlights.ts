import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface Highlight {
  id: string;
  user_id: string;
  title: string;
  cover_image: string | null;
  created_at: string;
  updated_at: string;
  items?: HighlightItem[];
}

export interface HighlightItem {
  id: string;
  highlight_id: string;
  story_id: string;
  added_at: string;
  story?: {
    media_url: string;
    media_type: string;
    caption: string | null;
    created_at: string;
  };
}

export const useStoryHighlights = (userId?: string) => {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchHighlights = async () => {
    try {
      setLoading(true);
      const targetUserId = userId || user?.id;
      
      if (!targetUserId) return;

      const { data, error } = await gateway
        .from('story_highlights')
        .select(`
          *,
          items:story_highlight_items(
            *,
            story:stories(
              media_url,
              media_type,
              caption,
              created_at
            )
          )
        `)
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setHighlights(data || []);
    } catch (error: any) {
      console.error('Error fetching highlights:', error);
      toast({
        title: 'Error',
        description: 'Failed to load highlights',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const createHighlight = async (title: string, coverImage?: string) => {
    if (!user) return null;

    try {
      const { data, error } = await gateway
        .from('story_highlights')
        .insert({
          user_id: user.id,
          title,
          cover_image: coverImage || null
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Highlight created successfully'
      });

      fetchHighlights();
      return data;
    } catch (error: any) {
      console.error('Error creating highlight:', error);
      toast({
        title: 'Error',
        description: 'Failed to create highlight',
        variant: 'destructive'
      });
      return null;
    }
  };

  const addStoryToHighlight = async (highlightId: string, storyId: string) => {
    try {
      const { error } = await gateway
        .from('story_highlight_items')
        .insert({
          highlight_id: highlightId,
          story_id: storyId
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Story added to highlight'
      });

      fetchHighlights();
    } catch (error: any) {
      console.error('Error adding story to highlight:', error);
      toast({
        title: 'Error',
        description: 'Failed to add story to highlight',
        variant: 'destructive'
      });
    }
  };

  const removeStoryFromHighlight = async (highlightItemId: string) => {
    try {
      const { error } = await gateway
        .from('story_highlight_items')
        .delete()
        .eq('id', highlightItemId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Story removed from highlight'
      });

      fetchHighlights();
    } catch (error: any) {
      console.error('Error removing story from highlight:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove story',
        variant: 'destructive'
      });
    }
  };

  const deleteHighlight = async (highlightId: string) => {
    try {
      const { error } = await gateway
        .from('story_highlights')
        .delete()
        .eq('id', highlightId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Highlight deleted successfully'
      });

      fetchHighlights();
    } catch (error: any) {
      console.error('Error deleting highlight:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete highlight',
        variant: 'destructive'
      });
    }
  };

  const updateHighlight = async (highlightId: string, title: string, coverImage?: string) => {
    try {
      const { error } = await gateway
        .from('story_highlights')
        .update({
          title,
          cover_image: coverImage || null
        })
        .eq('id', highlightId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Highlight updated successfully'
      });

      fetchHighlights();
    } catch (error: any) {
      console.error('Error updating highlight:', error);
      toast({
        title: 'Error',
        description: 'Failed to update highlight',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    fetchHighlights();

    // Real-time subscription
    const channel = gateway
      .channel('highlights-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'story_highlights'
        },
        () => {
          fetchHighlights();
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [userId, user?.id]);

  return {
    highlights,
    loading,
    createHighlight,
    addStoryToHighlight,
    removeStoryFromHighlight,
    deleteHighlight,
    updateHighlight,
    refetch: fetchHighlights
  };
};

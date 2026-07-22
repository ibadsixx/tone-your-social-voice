import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';

interface HiddenContent {
  id: string;
  content_id: string | null;
  content_type: 'reel' | 'video' | 'normal_post' | 'profile' | null;
  profile_id: string | null;
  created_at: string;
}

export const useHiddenContent = () => {
  const [hiddenContent, setHiddenContent] = useState<HiddenContent[]>([]);
  const [hiddenContentIds, setHiddenContentIds] = useState<Set<string>>(new Set());
  const [hiddenProfileIds, setHiddenProfileIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Fetch hidden content for the current user
  const fetchHiddenContent = useCallback(async () => {
    if (!user) {
      setHiddenContent([]);
      setHiddenContentIds(new Set());
      setHiddenProfileIds(new Set());
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await gateway
        .from('hidden_content')
        .select('id, content_id, content_type, profile_id, created_at')
        .eq('user_id', user.id);

      if (error) throw error;

      const items = (data || []) as HiddenContent[];
      setHiddenContent(items);
      
      // Build Sets for O(1) lookup
      const contentIds = new Set<string>();
      const profileIds = new Set<string>();
      
      items.forEach(h => {
        if (h.content_id) contentIds.add(h.content_id);
        if (h.profile_id) profileIds.add(h.profile_id);
      });
      
      setHiddenContentIds(contentIds);
      setHiddenProfileIds(profileIds);
      
      console.log('[HIDDEN_CONTENT] Loaded:', {
        contentIds: contentIds.size,
        profileIds: profileIds.size
      });
    } catch (error) {
      console.error('[HIDDEN_CONTENT] Error fetching:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHiddenContent();
  }, [fetchHiddenContent]);

  /**
   * Hide a single piece of content (reel, video, post)
   * Optimistic update for immediate UI response
   */
  const hideContent = useCallback(async (
    contentId: string,
    contentType: 'reel' | 'video' | 'normal_post'
  ): Promise<boolean> => {
    if (!user?.id) return false;

    // Optimistic update
    setHiddenContentIds(prev => new Set([...prev, contentId]));

    const payload = {
      user_id: user.id,
      content_id: contentId,
      content_type: contentType,
      profile_id: null
    };

    console.log('[HIDDEN_CONTENT] INSERT payload:', payload);

    try {
      const { data, error } = await gateway
        .from('hidden_content')
        .insert(payload)
        .select()
        .single();

      if (error) {
        // Handle duplicate - content already hidden
        if (error.code === '23505') {
          console.log('[HIDDEN_CONTENT] Already hidden:', contentId);
          return true;
        }
        throw error;
      }

      console.log('[HIDDEN_CONTENT] INSERT success:', data);
      return true;
    } catch (error) {
      // Revert optimistic update on error
      setHiddenContentIds(prev => {
        const next = new Set(prev);
        next.delete(contentId);
        return next;
      });
      console.error('[HIDDEN_CONTENT] Error hiding content:', error);
      return false;
    }
  }, [user?.id]);

  /**
   * Hide all content from a profile
   */
  const hideProfile = useCallback(async (profileId: string): Promise<boolean> => {
    if (!user?.id) return false;
    if (profileId === user.id) return false; // Can't hide own profile

    // Optimistic update
    setHiddenProfileIds(prev => new Set([...prev, profileId]));

    console.log('[HIDDEN_CONTENT] INSERT profile:', { user_id: user.id, profile_id: profileId });

    try {
      const { data, error } = await gateway
        .from('hidden_content')
        .insert({
          user_id: user.id,
          content_type: 'profile' as any, // 'profile' enum value added via migration
          profile_id: profileId
        } as any)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          console.log('[HIDDEN_CONTENT] Profile already hidden:', profileId);
          return true;
        }
        throw error;
      }

      console.log('[HIDDEN_CONTENT] INSERT profile success:', data);
      return true;
    } catch (error) {
      // Revert
      setHiddenProfileIds(prev => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
      console.error('[HIDDEN_CONTENT] Error hiding profile:', error);
      return false;
    }
  }, [user?.id]);

  /**
   * Unhide content
   */
  const unhideContent = useCallback(async (contentId: string): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { error } = await gateway
        .from('hidden_content')
        .delete()
        .eq('user_id', user.id)
        .eq('content_id', contentId);

      if (error) throw error;

      setHiddenContentIds(prev => {
        const next = new Set(prev);
        next.delete(contentId);
        return next;
      });
      return true;
    } catch (error) {
      console.error('[HIDDEN_CONTENT] Error unhiding content:', error);
      return false;
    }
  }, [user?.id]);

  /**
   * Unhide profile
   */
  const unhideProfile = useCallback(async (profileId: string): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { error } = await gateway
        .from('hidden_content')
        .delete()
        .eq('user_id', user.id)
        .eq('profile_id', profileId);

      if (error) throw error;

      setHiddenProfileIds(prev => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
      return true;
    } catch (error) {
      console.error('[HIDDEN_CONTENT] Error unhiding profile:', error);
      return false;
    }
  }, [user?.id]);

  /**
   * Check if specific content is hidden
   */
  const isContentHidden = useCallback(
    (contentId: string) => hiddenContentIds.has(contentId),
    [hiddenContentIds]
  );

  /**
   * Check if profile is hidden
   */
  const isProfileHidden = useCallback(
    (profileId: string) => hiddenProfileIds.has(profileId),
    [hiddenProfileIds]
  );

  /**
   * Check if content should be visible
   * Hidden if: content_id matches OR owner's profile_id matches
   */
  const shouldShowContent = useCallback(
    (contentId: string, ownerId?: string): boolean => {
      if (hiddenContentIds.has(contentId)) return false;
      if (ownerId && hiddenProfileIds.has(ownerId)) return false;
      return true;
    },
    [hiddenContentIds, hiddenProfileIds]
  );

  return {
    hiddenContent,
    hiddenContentIds,
    hiddenProfileIds,
    loading,
    hideContent,
    hideProfile,
    unhideContent,
    unhideProfile,
    isContentHidden,
    isProfileHidden,
    shouldShowContent,
    refetch: fetchHiddenContent,
  };
};

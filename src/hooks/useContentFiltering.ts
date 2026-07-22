import { useState, useEffect, useCallback, useMemo } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';

interface ContentFilteringState {
  blockedUserIds: string[];
  restrictedUserIds: string[];
  mutedUserIds: string[];
  hiddenContentIds: string[];
  hiddenProfileIds: string[];
  seeLessOwnerIds: string[];
  loading: boolean;
}

/**
 * Hook for filtering content based on blocks, hides, and other user preferences.
 * This provides efficient client-side filtering for reels, posts, and other content.
 */
export const useContentFiltering = () => {
  const [state, setState] = useState<ContentFilteringState>({
    blockedUserIds: [],
    restrictedUserIds: [],
    mutedUserIds: [],
    hiddenContentIds: [],
    hiddenProfileIds: [],
    seeLessOwnerIds: [],
    loading: true,
  });
  const { user } = useAuth();

  // Fetch all filtering data
  const fetchFilteringData = useCallback(async () => {
    if (!user) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      // Fetch blocked users
      const { data: blocksData } = await gateway
        .from('blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);

      const blockedIds = blocksData?.map(block => 
        block.blocker_id === user.id ? block.blocked_id : block.blocker_id
      ) || [];

      // Fetch hidden content - separate queries for content and profiles
      // content_id entries are "See less" (single reel)
      // profile_id entries are "Hide profile" (all content from creator)
      const { data: hiddenData } = await gateway
        .from('hidden_content')
        .select('content_id, profile_id, content_type')
        .eq('user_id', user.id);

      // Hidden reels (See less) - only content_id with content_type='reel'
      const hiddenContentIds = hiddenData
        ?.filter(h => h.content_id && h.content_type === 'reel')
        .map(h => h.content_id!) || [];

      // Hidden profiles (Hide all from creator) - only profile_id entries
      const hiddenProfileIds = hiddenData
        ?.filter(h => h.profile_id && !h.content_id)
        .map(h => h.profile_id!) || [];
      
      console.log('[CONTENT_FILTER] Hidden reels (See less):', hiddenContentIds);
      console.log('[CONTENT_FILTER] Hidden profiles:', hiddenProfileIds);

      // Fetch restricted users
      const { data: restrictedData } = await gateway
        .from('restricted_users')
        .select('restricted_user_id')
        .eq('user_id', user.id);

      const restrictedIds = restrictedData?.map(r => r.restricted_user_id) || [];

      // Fetch muted users
      const { data: mutedData } = await gateway
        .from('muted_users')
        .select('muted_user_id')
        .eq('user_id', user.id);

      const mutedIds = mutedData?.map(m => m.muted_user_id) || [];

      // Fetch see_less preferences for reels
      const { data: seeLessData } = await gateway
        .from('content_preferences')
        .select('owner_id')
        .eq('user_id', user.id)
        .eq('content_type', 'reel')
        .eq('preference', 'see_less');

      const seeLessOwnerIds = seeLessData?.map(p => p.owner_id) || [];

      setState({
        blockedUserIds: blockedIds,
        restrictedUserIds: restrictedIds,
        mutedUserIds: mutedIds,
        hiddenContentIds,
        hiddenProfileIds,
        seeLessOwnerIds,
        loading: false,
      });

      console.log('[CONTENT_FILTER] Loaded:', {
        blockedUsers: blockedIds.length,
        restrictedUsers: restrictedIds.length,
        mutedUsers: mutedIds.length,
        hiddenContent: hiddenContentIds.length,
        hiddenProfiles: hiddenProfileIds.length,
        seeLessOwners: seeLessOwnerIds.length,
      });
    } catch (error) {
      console.error('[CONTENT_FILTER] Error fetching filtering data:', error);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [user]);

  useEffect(() => {
    fetchFilteringData();
  }, [fetchFilteringData]);

  // Check if a user is blocked
  const isUserBlocked = useCallback(
    (userId: string) => state.blockedUserIds.includes(userId),
    [state.blockedUserIds]
  );

  // Check if content is hidden
  const isContentHidden = useCallback(
    (contentId: string) => state.hiddenContentIds.includes(contentId),
    [state.hiddenContentIds]
  );

  // Check if profile is hidden
  const isProfileHidden = useCallback(
    (profileId: string) => state.hiddenProfileIds.includes(profileId),
    [state.hiddenProfileIds]
  );

  // Check if user is restricted
  const isUserRestricted = useCallback(
    (userId: string) => state.restrictedUserIds.includes(userId),
    [state.restrictedUserIds]
  );

  // Check if user is muted
  const isUserMuted = useCallback(
    (userId: string) => state.mutedUserIds.includes(userId),
    [state.mutedUserIds]
  );

  // Check if owner is in "see less" list
  const isSeeLessOwner = useCallback(
    (ownerId: string) => state.seeLessOwnerIds.includes(ownerId),
    [state.seeLessOwnerIds]
  );

  // Combined check: should content be visible?
  const shouldShowContent = useCallback(
    (contentId: string, ownerId: string) => {
      // Check if owner is blocked
      if (state.blockedUserIds.includes(ownerId)) {
        return false;
      }
      // Check if content is hidden
      if (state.hiddenContentIds.includes(contentId)) {
        return false;
      }
      // Check if profile is hidden
      if (state.hiddenProfileIds.includes(ownerId)) {
        return false;
      }
      // Check if user is muted - exclude from feed
      if (state.mutedUserIds.includes(ownerId)) {
        return false;
      }
      // Check if owner is in "see less" list - exclude from feed
      if (state.seeLessOwnerIds.includes(ownerId)) {
        return false;
      }
      return true;
    },
    [state.blockedUserIds, state.hiddenContentIds, state.hiddenProfileIds, state.mutedUserIds, state.seeLessOwnerIds]
  );

  // Filter an array of content items
  const filterContent = useCallback(
    <T extends { id: string; user_id?: string; owner_id?: string }>(
      items: T[]
    ): T[] => {
      return items.filter(item => {
        const ownerId = item.user_id || item.owner_id;
        if (!ownerId) return true;
        return shouldShowContent(item.id, ownerId);
      });
    },
    [shouldShowContent]
  );

  // Get exclusion filters for database queries
  const exclusionFilters = useMemo(() => ({
    blockedUserIds: state.blockedUserIds,
    restrictedUserIds: state.restrictedUserIds,
    mutedUserIds: state.mutedUserIds,
    hiddenContentIds: state.hiddenContentIds,
    hiddenProfileIds: state.hiddenProfileIds,
    seeLessOwnerIds: state.seeLessOwnerIds,
  }), [state.blockedUserIds, state.restrictedUserIds, state.mutedUserIds, state.hiddenContentIds, state.hiddenProfileIds, state.seeLessOwnerIds]);

  return {
    ...state,
    isUserBlocked,
    isUserRestricted,
    isUserMuted,
    isContentHidden,
    isProfileHidden,
    isSeeLessOwner,
    shouldShowContent,
    filterContent,
    exclusionFilters,
    refetch: fetchFilteringData,
  };
};

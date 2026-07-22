import { useState } from 'react';
import { gateway } from '@/lib/gateway';

export const useSeeLessPreference = () => {
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Hide a single reel by inserting into hidden_content.
   * Only saves content_id and content_type='reel'.
   * profile_id is ALWAYS null - this hides a single reel, not all content from creator.
   */
  const hideReel = async (reelId: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { data: { user } } = await gateway.auth.getUser();
      if (!user) {
        console.log('[SEE_LESS] User not authenticated');
        return false;
      }

      console.log('[SEE_LESS] Before insert - reel_id:', reelId, 'user_id:', user.id);

      // Check if already hidden
      const { data: existing } = await gateway
        .from('hidden_content')
        .select('id')
        .eq('user_id', user.id)
        .eq('content_id', reelId)
        .eq('content_type', 'reel')
        .maybeSingle();

      if (existing) {
        console.log('[SEE_LESS] Reel already hidden:', reelId);
        return true;
      }

      // Insert into hidden_content - profile_id is explicitly null
      const { error } = await gateway
        .from('hidden_content')
        .insert({
          user_id: user.id,
          content_id: reelId,
          content_type: 'reel',
          profile_id: null, // ALWAYS null for "See less"
        });

      if (error) {
        console.error('[SEE_LESS] Insert error:', error);
        throw error;
      }

      console.log('[SEE_LESS] Successfully hidden reel:', reelId);
      return true;
    } catch (error) {
      console.error('[SEE_LESS] Error hiding reel:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return { hideReel, isLoading };
};

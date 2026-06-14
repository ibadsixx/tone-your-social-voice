import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useHasActiveStories(userId: string | undefined): boolean {
  const [hasStories, setHasStories] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHasStories(false);
      return;
    }

    const check = async () => {
      const { count } = await supabase
        .from('stories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString());

      setHasStories((count ?? 0) > 0);
    };

    check();

    const channel = supabase
      .channel(`user-stories-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories',
          filter: `user_id=eq.${userId}`,
        },
        check,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return hasStories;
}

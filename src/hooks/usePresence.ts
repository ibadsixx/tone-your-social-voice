import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const POLL_INTERVAL_MS = 30000;
const OFFLINE_THRESHOLD_MS = 60000;

export function isOnline(lastSeenAt?: string): boolean {
  if (!lastSeenAt) return false;
  const now = Date.now();
  const lastSeen = new Date(lastSeenAt).getTime();
  return now - lastSeen < OFFLINE_THRESHOLD_MS;
}

export function formatLastSeen(lastSeenAt?: string): string {
  if (!lastSeenAt) return 'Offline';
  
  const lastSeen = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - lastSeen.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return lastSeen.toLocaleDateString();
}

export function usePresence(userId?: string) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const updateLastSeen = async () => {
      await supabase.rpc('update_last_seen');
    };

    const updateLastSeenSync = () => {
      supabase.rpc('update_last_seen').catch(() => {});
    };

    updateLastSeen();
    intervalRef.current = setInterval(updateLastSeen, POLL_INTERVAL_MS);

    window.addEventListener('beforeunload', updateLastSeenSync);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        updateLastSeenSync();
      }
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('beforeunload', updateLastSeenSync);
    };
  }, [userId]);
}

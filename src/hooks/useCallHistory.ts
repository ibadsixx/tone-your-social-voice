import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';

export interface CallHistoryItem {
  id: string;
  other_user_id: string;
  other_user_username: string;
  other_user_display_name: string;
  other_user_profile_pic: string | null;
  call_type: 'voice' | 'video';
  status: 'completed' | 'missed' | 'declined' | 'busy' | 'failed';
  is_outgoing: boolean;
  started_at: string;
  duration_seconds: number;
}

export const useCallHistory = () => {
  const { user } = useAuth();
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCallHistory = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await gateway.rpc('get_call_history', {
        p_user_id: user.id,
        p_limit: 50
      });

      if (fetchError) throw fetchError;
      setCallHistory((data as CallHistoryItem[]) || []);
    } catch (err) {
      console.error('[CallHistory] Error fetching:', err);
      setError('Failed to load call history');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCallHistory();
  }, [fetchCallHistory]);

  const logCall = useCallback(async (
    receiverId: string,
    callType: 'voice' | 'video',
    status: 'completed' | 'missed' | 'declined' | 'busy' | 'failed',
    durationSeconds: number = 0
  ) => {
    if (!user?.id) return null;

    try {
      const { data, error: logError } = await gateway.rpc('log_call', {
        p_caller_id: user.id,
        p_receiver_id: receiverId,
        p_call_type: callType,
        p_status: status,
        p_duration_seconds: durationSeconds
      });

      if (logError) throw logError;

      // Refresh call history
      await fetchCallHistory();

      return data;
    } catch (err) {
      console.error('[CallHistory] Error logging call:', err);
      return null;
    }
  }, [user?.id, fetchCallHistory]);

  return {
    callHistory,
    loading,
    error,
    logCall,
    refetch: fetchCallHistory
  };
};

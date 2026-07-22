import { useCallback, useRef, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { CallSignal } from '@/services/webrtc';
import { RealtimeChannel } from '@supabase/supabase-js';

interface UseCallSignalingOptions {
  userId: string | undefined;
  onSignal: (signal: CallSignal) => void;
}

export const useCallSignaling = ({ userId, onSignal }: UseCallSignalingOptions) => {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pendingChannelsRef = useRef<Set<RealtimeChannel>>(new Set());

  // Send signal to target user with proper cleanup
  const sendSignal = useCallback(async (signal: CallSignal) => {
    const targetChannel = gateway.channel(`calls:${signal.to}`, {
      config: { broadcast: { self: false } },
    });
    
    // Track pending channel for cleanup
    pendingChannelsRef.current.add(targetChannel);
    
    try {
      await targetChannel.subscribe();
      await targetChannel.send({
        type: 'broadcast',
        event: 'call-signal',
        payload: signal,
      });
      console.log('[Signaling] Signal sent:', signal.type, 'to:', signal.to);
    } catch (error) {
      console.error('[Signaling] Error sending signal:', error);
    } finally {
      // Cleanup after sending with a small delay to ensure delivery
      setTimeout(() => {
        pendingChannelsRef.current.delete(targetChannel);
        gateway.removeChannel(targetChannel);
      }, 500);
    }
  }, []);

  // Setup Supabase Realtime channel for signaling
  useEffect(() => {
    if (!userId) return;

    const channelName = `calls:${userId}`;
    console.log('[Signaling] Setting up channel:', channelName);
    
    channelRef.current = gateway.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channelRef.current
      .on('broadcast', { event: 'call-signal' }, ({ payload }) => {
        onSignal(payload as CallSignal);
      })
      .subscribe((status) => {
        console.log('[Signaling] Channel subscription status:', status);
      });

    return () => {
      console.log('[Signaling] Cleaning up channels');
      
      // Clean up main channel
      if (channelRef.current) {
        gateway.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      
      // Clean up any pending send channels
      pendingChannelsRef.current.forEach((channel) => {
        gateway.removeChannel(channel);
      });
      pendingChannelsRef.current.clear();
    };
  }, [userId, onSignal]);

  return { sendSignal };
};

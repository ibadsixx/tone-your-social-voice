import { useCallback, useRef, useEffect } from 'react';
import { openCallChannel, CallRealtimeChannel } from '@/lib/callRealtime';
import { CallSignal } from '@/services/webrtc';

interface UseCallSignalingOptions {
  userId: string | undefined;
  onSignal: (signal: CallSignal) => void;
}

export const useCallSignaling = ({ userId, onSignal }: UseCallSignalingOptions) => {
  const channelRef = useRef<CallRealtimeChannel | null>(null);
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  // Send signal to target user through the gateway SSE bridge.
  const sendSignal = useCallback(async (signal: CallSignal) => {
    const targetChannel = openCallChannel(`calls:${signal.to}`);
    await targetChannel.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: signal,
    });
  }, []);

  // Subscribe to the gateway's realtime channel for incoming call signals.
  useEffect(() => {
    if (!userId) return;

    const channelName = `calls:${userId}`;
    console.log('[Signaling] Setting up channel:', channelName);

    channelRef.current = openCallChannel(channelName, { self: false });

    channelRef.current
      .on('broadcast', { event: 'call-signal' }, ({ payload }) => {
        onSignalRef.current(payload as CallSignal);
      })
      .subscribe((status) => {
        console.log('[Signaling] Channel subscription status:', status);
      });

    return () => {
      console.log('[Signaling] Cleaning up channels');

      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [userId]);

  return { sendSignal };
};

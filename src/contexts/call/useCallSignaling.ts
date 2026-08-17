import { useCallback, useRef, useEffect } from 'react';
import { openCallChannel, CallRealtimeChannel, CallDelivery } from '@/lib/callRealtime';
import { CallSignal } from '@/services/webrtc';

interface UseCallSignalingOptions {
  userId: string | undefined;
  onSignal: (signal: CallSignal) => void;
}

export const useCallSignaling = ({ userId, onSignal }: UseCallSignalingOptions) => {
  const channelRef = useRef<CallRealtimeChannel | null>(null);
  const sendChannelRef = useRef<CallRealtimeChannel | null>(null);
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  const sendSignal = useCallback(async (signal: CallSignal): Promise<CallDelivery> => {
    const targetChannelName = `calls:${signal.to}`;

    if (!sendChannelRef.current || sendChannelRef.current['channelName'] !== targetChannelName) {
      sendChannelRef.current?.unsubscribe();
      sendChannelRef.current = openCallChannel(targetChannelName);
    }

    return sendChannelRef.current.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: signal,
    });
  }, []);

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
      if (sendChannelRef.current) {
        sendChannelRef.current.unsubscribe();
        sendChannelRef.current = null;
      }
    };
  }, [userId]);

  return { sendSignal };
};

// Messaging realtime must use the routed Supabase Realtime facade, never the
// removed SSE/publish bridge or an API Gateway fallback.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { channelDouble } = vi.hoisted(() => ({
  channelDouble: {
    on: vi.fn(),
    subscribe: vi.fn(),
    send: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/dataClient', () => ({
  dataClient: {
    channel: vi.fn(() => channelDouble),
    removeChannel: vi.fn(),
  },
}));

import { UserRealtimeChannel } from '@/lib/messageRealtime';
import { dataClient } from '@/lib/supabase/dataClient';

const mockChannel = vi.mocked(dataClient.channel);
const mockRemoveChannel = vi.mocked(dataClient.removeChannel);

beforeEach(() => {
  vi.clearAllMocks();
  channelDouble.send.mockResolvedValue('ok');
});

describe('direct Supabase Realtime messaging', () => {
  it('joins only the signed-in user topic and registers broadcast listeners', () => {
    const realtime = new UserRealtimeChannel('user-1');
    const listener = vi.fn();
    realtime.on('message.created', listener);
    realtime.start();

    expect(mockChannel).toHaveBeenCalledWith(
      'user:user-1',
      expect.objectContaining({ domain: 'messages' })
    );
    expect(channelDouble.on).toHaveBeenCalledWith('broadcast', { event: 'message.created' }, expect.any(Function));
    expect(channelDouble.subscribe).toHaveBeenCalled();
  });

  it('publishes to the recipient topic through Supabase broadcast', async () => {
    const realtime = new UserRealtimeChannel('user-1');
    const result = await realtime.publish('message.created', { type: 'message.created' }, 'user-2');

    expect(mockChannel).toHaveBeenCalledWith(
      'user:user-2',
      expect.objectContaining({ domain: 'messages' })
    );
    expect(channelDouble.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'message.created',
      payload: { type: 'message.created' },
    });
    expect(result).toEqual({ ok: true, delivered: 1 });
  });

  it('fires resync callbacks on a real channel (re)subscription', () => {
    const realtime = new UserRealtimeChannel('user-1');
    const onReconnect = vi.fn();
    realtime.onReconnect(onReconnect);
    realtime.start();

    const statusCallback = channelDouble.subscribe.mock.calls[0][0] as (status: string) => void;
    statusCallback('SUBSCRIBED');
    expect(onReconnect).toHaveBeenCalledTimes(1);

    statusCallback('CLOSED');
    statusCallback('SUBSCRIBED');
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });

  it('releases every direct channel on stop', () => {
    const realtime = new UserRealtimeChannel('user-1');
    realtime.start();
    realtime.stop();

    expect(mockRemoveChannel).toHaveBeenCalledWith(channelDouble);
  });
});

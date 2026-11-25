import { dataClient, type DirectChannel } from '@/lib/supabase/dataClient';

type BroadcastCallback = (payload: unknown) => void;

export interface CallDelivery {
  ok: boolean;
  delivered: number;
}

interface CallChannelConfig {
  self?: boolean;
}

// Call signaling uses Supabase Realtime broadcast channels on the routed
// conversations project. The channel is named `calls:<userId>`; only the two
// participants subscribe, and the central Auth JWT is sent with every request.
// There is no custom SSE/publish bridge and no API Gateway fallback.

export class CallRealtimeChannel {
  private channel: DirectChannel;
  private subscribed = false;
  private disposed = false;

  constructor(readonly channelName: string, config?: CallChannelConfig) {
    const self = config?.self ?? false;
    this.channel = dataClient.channel(channelName, {
      domain: 'conversations',
      config: { broadcast: { self } },
    });
  }

  on(type: string, filter: Record<string, unknown> | string, callback: BroadcastCallback): this {
    if (type !== 'broadcast') return this;
    const event = typeof filter === 'string' ? filter : (filter as Record<string, unknown>).event as string;
    if (!event) return this;
    this.channel.on('broadcast', { event }, (message: { payload?: unknown }) => {
      callback({ payload: message?.payload ?? message });
    });
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    if (this.disposed) return this;
    this.channel.subscribe(callback);
    this.subscribed = true;
    return this;
  }

  async send(options: { type: string; event: string; payload: unknown }): Promise<CallDelivery> {
    if (this.disposed) return { ok: false, delivered: 0 };
    if (!this.subscribed) {
      this.channel.subscribe();
      this.subscribed = true;
    }
    try {
      const sent = await this.channel.send({
        type: 'broadcast',
        event: options.event,
        payload: options.payload,
      });
      return sent ? { ok: true, delivered: 1 } : { ok: false, delivered: 0 };
    } catch {
      return { ok: false, delivered: 0 };
    }
  }

  unsubscribe(): void {
    if (this.disposed) return;
    this.disposed = true;
    dataClient.removeChannel(this.channel);
    this.subscribed = false;
  }
}

export function openCallChannel(name: string, config?: CallChannelConfig): CallRealtimeChannel {
  return new CallRealtimeChannel(name, config);
}

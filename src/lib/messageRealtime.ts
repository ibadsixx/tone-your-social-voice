import { dataClient, type DirectChannel } from '@/lib/supabase/dataClient';
import { getEdgeBaseUrl } from '@/lib/supabase/edgeTransport';

// Chat realtime is delivered by Supabase Realtime on the routed messages
// project. Each client joins exactly one private broadcast topic for its own
// user id (`user:<userId>`); senders publish to the recipient's topic. There is
// no custom SSE/publish bridge and no API Gateway fallback.
//
// Topic authorization is owned by Supabase Realtime policies on the messages
// project (realtime.messages / private broadcast channels). The frontend uses
// only the public anon key plus the signed-in user's JWT.

// Retained for callers that derive long-lived transport URLs from this module.
export const EDGE_BASE_URL = getEdgeBaseUrl();

type RealtimeCallback = (payload: unknown) => void;

export interface UserChannelEvent {
  type: 'message.created' | 'message.read' | 'message.delivered';
  conversationId?: string;
  message?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface PublishResult {
  ok: boolean;
  delivered: number;
}

const MESSAGE_DOMAIN = 'messages';
const MAX_PUBLISH_CHANNELS = 50;

function channelConfig(): Record<string, unknown> {
  return { domain: MESSAGE_DOMAIN, config: { broadcast: { self: false } } };
}

let shared: UserRealtimeChannel | null = null;
let sharedSubscribers = 0;

export class UserRealtimeChannel {
  readonly userId: string;
  private listeners: Array<{ event: string; callback: RealtimeCallback }> = [];
  private reconnectCallbacks: Array<() => void> = [];
  private channel: DirectChannel | null = null;
  private publishChannels = new Map<string, DirectChannel>();
  private lastStatus: string | null = null;
  private disposed = false;

  constructor(userId: string) {
    this.userId = userId;
  }

  on(event: string, callback: RealtimeCallback): this {
    this.listeners.push({ event, callback });
    if (this.channel) this.attachBroadcast(this.channel, event, callback);
    return this;
  }

  /**
   * Fires when the Supabase Realtime channel (re)subscribes. Long-lived readers
   * use it as a polling-free resync signal after a dropped connection.
   */
  onReconnect(callback: () => void): () => void {
    this.reconnectCallbacks.push(callback);
    return () => {
      const idx = this.reconnectCallbacks.indexOf(callback);
      if (idx !== -1) this.reconnectCallbacks.splice(idx, 1);
    };
  }

  start(): void {
    this.disposed = false;
    if (this.channel) return;
    const channel = dataClient.channel(`user:${this.userId}`, channelConfig());
    this.channel = channel;
    for (const listener of this.listeners) {
      this.attachBroadcast(channel, listener.event, listener.callback);
    }
    channel.subscribe((status) => this.handleStatus(status));
  }

  stop(): void {
    this.disposed = true;
    if (this.channel) dataClient.removeChannel(this.channel);
    this.channel = null;
    for (const channel of this.publishChannels.values()) dataClient.removeChannel(channel);
    this.publishChannels.clear();
    this.lastStatus = null;
  }

  async publish(event: string, payload: UserChannelEvent, targetUserId: string): Promise<PublishResult> {
    if (!targetUserId || this.disposed) return { ok: false, delivered: 0 };

    let channel = this.publishChannels.get(targetUserId);
    if (!channel) {
      if (this.publishChannels.size >= MAX_PUBLISH_CHANNELS) {
        const oldest = this.publishChannels.keys().next().value;
        if (oldest) {
          const evicted = this.publishChannels.get(oldest);
          if (evicted) dataClient.removeChannel(evicted);
          this.publishChannels.delete(oldest);
        }
      }
      channel = dataClient.channel(`user:${targetUserId}`, channelConfig());
      // Join the topic so Supabase Realtime can fan the broadcast out; the
      // channel has no listeners, so the sender never reads the recipient's
      // events.
      channel.subscribe();
      this.publishChannels.set(targetUserId, channel);
    }

    try {
      const sent = await channel.send({ type: 'broadcast', event, payload });
      return sent ? { ok: true, delivered: 1 } : { ok: false, delivered: 0 };
    } catch {
      return { ok: false, delivered: 0 };
    }
  }

  private attachBroadcast(channel: DirectChannel, event: string, callback: RealtimeCallback): void {
    channel.on('broadcast', { event }, (message: { payload?: unknown }) => {
      callback(message?.payload ?? message);
    });
  }

  private handleStatus(status: string): void {
    if (status === this.lastStatus) return;
    this.lastStatus = status;
    if (status !== 'SUBSCRIBED') return;
    if (this.disposed) return;
    for (const cb of [...this.reconnectCallbacks]) {
      try {
        cb();
      } catch {
        // a resync consumer must never take the channel down
      }
    }
  }
}

// Gets (starting if needed) the single shared subscription for the current
// user. This does NOT increment the ref count; use this for one-shot publishes.
// Long-lived listeners should use subscribeToMessages so the count is balanced.
export function getMessageRealtime(userId: string): UserRealtimeChannel | null {
  if (!userId) return null;
  if (shared && shared.userId !== userId) {
    shared.stop();
    shared = null;
    sharedSubscribers = 0;
  }
  if (!shared) {
    shared = new UserRealtimeChannel(userId);
    shared.start();
  }
  return shared;
}

export function subscribeToMessages(userId: string, event: string, callback: RealtimeCallback): () => void {
  const channel = getMessageRealtime(userId);
  if (!channel) return () => {};
  sharedSubscribers++;

  const handler = (payload: unknown) => callback(payload);
  channel.on(event, handler);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    sharedSubscribers = Math.max(0, sharedSubscribers - 1);
    if (sharedSubscribers === 0 && shared) {
      shared.stop();
      shared = null;
    }
  };
  return release;
}

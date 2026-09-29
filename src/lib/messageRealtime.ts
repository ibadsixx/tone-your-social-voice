import { gateway } from '@/lib/gateway';

const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL;

// Realtime delivery for chat messages, delivered over the gateway's SSE hub
// (GET /api/realtime/subscribe/:channel + POST /api/realtime/publish). In this
// architecture the app never talks to Supabase Realtime directly -- the gateway
// is the only entry point, so message events are routed through a per-user
// channel (`user:<userId>`) that the gateway fans out (including across serverless
// instances via its broadcast bus). A sender publishes `message.created` to the
// receiver's `user:<receiverId>`, and each client keeps one SSE subscription to
// its own `user:<currentUserId>` channel.

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

let shared: UserRealtimeChannel | null = null;
let sharedSubscribers = 0;

function getToken(): string | null {
  try {
    const sessionStr = localStorage.getItem('tone-auth-token');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      return session?.access_token ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

// SSE subscriber to a single user channel, with token refresh + backoff
// reconnect (mirrors CallRealtimeChannel in src/lib/callRealtime.ts).
export class UserRealtimeChannel {
  private userId: string;
  private listeners: Array<{ event: string; callback: RealtimeCallback }> = [];
  private reconnectCallbacks: Array<() => void> = [];
  private connId: string | null = null;
  private controller: AbortController | null = null;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;
  private disposed = false;

  constructor(userId: string) {
    this.userId = userId;
  }

  on(event: string, callback: RealtimeCallback): this {
    this.listeners.push({ event, callback });
    return this;
  }

  /**
   * Run `callback` whenever the stream (re)connects. Every successful
   * connection — the first one and each reconnect — begins with an `init`
   * frame carrying a fresh `connId`, so this fires exactly there. The global
   * unread-badge provider uses it as its polling-free resync signal (do.md
   * §15 reconnect): events that were lost while the stream was down are
   * re-read from the server. Returns an unsubscribe.
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
    this.connect();
  }

  stop(): void {
    this.disposed = true;
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    this.controller?.abort();
    this.controller = null;
  }

  async publish(event: string, payload: UserChannelEvent, targetUserId: string): Promise<PublishResult> {
    if (!GATEWAY_URL) return { ok: false, delivered: 0 };
    const channel = `user:${targetUserId}`;
    console.log(`[MessageRealtime] Publishing ${event} → ${channel}`);
    const post = async (token: string) =>
      fetch(`${GATEWAY_URL}/api/realtime/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel,
          event,
          payload,
          excludeConnId: this.connId ?? undefined,
        }),
      });

    let token = getToken();
    if (!token) return { ok: false, delivered: 0 };
    try {
      let res = await post(token);
      if (res.status === 401) {
        await gateway.auth.refreshSession();
        token = getToken();
        if (!token) return { ok: false, delivered: 0 };
        res = await post(token);
      }
      if (!res.ok) return { ok: false, delivered: 0 };
      const json = await res.json().catch(() => null);
      const delivered = typeof json?.delivered === 'number' ? json.delivered : 0;
      console.log(`[MessageRealtime] Publish ${event} → ${channel}: delivered=${delivered}`);
      return { ok: true, delivered };
    } catch {
      return { ok: false, delivered: 0 };
    }
  }

  private async connect(): Promise<void> {
    if (this.disposed || !GATEWAY_URL) return;
    const url = `${GATEWAY_URL}/api/realtime/subscribe/${encodeURIComponent(`user:${this.userId}`)}`;
    let token = getToken();
    if (!token || !GATEWAY_URL) {
      this.scheduleReconnect();
      return;
    }

    const controller = new AbortController();
    this.controller = controller;
    const fetchStream = (authToken: string) =>
      fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
        signal: controller.signal,
      });

    let res: Response;
    try {
      res = await fetchStream(token);
    } catch {
      if (!this.disposed) this.scheduleReconnect();
      return;
    }

    if (res.status === 401) {
      await gateway.auth.refreshSession();
      token = getToken();
      if (!token) {
        this.scheduleReconnect();
        return;
      }
      try {
        res = await fetchStream(token);
      } catch {
        if (!this.disposed) this.scheduleReconnect();
        return;
      }
    }

    if (!res.ok || !res.body) {
      console.warn(`[MessageRealtime] SSE subscribe failed: status=${res.status}`);
      this.scheduleReconnect();
      return;
    }

    this.retryDelay = 1000;
    console.log(`[MessageRealtime] SSE connected to user:${this.userId}`);
    await this.readStream(res, controller);
  }

  private async readStream(res: Response, controller: AbortController): Promise<void> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!this.disposed && !controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          this.handleFrame(frame);
        }
      }
    } catch {
      // stream error → reconnect below
    }
    if (!this.disposed) {
      this.controller = null;
      this.scheduleReconnect();
    }
  }

  private handleFrame(frame: string): void {
    let event = 'message';
    let data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data += line.slice(6);
    }
    if (event === 'init') {
      try {
        this.connId = JSON.parse(data)?.connId ?? null;
      } catch {
        // ignore malformed init
      }
      for (const cb of [...this.reconnectCallbacks]) {
        try {
          cb();
        } catch {
          // a resync consumer must never take the stream down
        }
      }
      return;
    }
    if (event !== 'message' || !data) return;

    let parsed: { event?: string; payload?: unknown };
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const evt = parsed?.event;
    if (!evt) return;
    for (const listener of this.listeners) {
      if (listener.event === evt) {
        try {
          listener.callback(parsed?.payload);
        } catch {
          // ignore handler errors
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    this.retryTimeout = setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 2, 30000);
      this.connect();
    }, this.retryDelay);
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
    console.log(`[MessageRealtime] Starting SSE subscription to user:${userId}`);
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

export { GATEWAY_URL };

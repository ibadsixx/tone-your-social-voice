import { gateway } from '@/lib/gateway';

const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL;

type BroadcastCallback = (payload: unknown) => void;

export interface CallDelivery {
  ok: boolean;
  delivered: number;
}

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

interface CallChannelConfig {
  self?: boolean;
}

// Realtime channel for call signaling that talks to the gateway's SSE bridge
// (GET /api/realtime/subscribe/:channel + POST /api/realtime/publish) instead
// of the local-only mock GatewayChannel.
export class CallRealtimeChannel {
  private channelName: string;
  private self: boolean;
  private broadcastListeners: Array<{ event: string; callback: BroadcastCallback }> = [];
  private connId: string | null = null;
  private controller: AbortController | null = null;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;
  private disposed = false;

  constructor(name: string, config?: CallChannelConfig) {
    this.channelName = name;
    this.self = config?.self ?? false;
  }

  on(type: string, filter: Record<string, unknown> | string, callback: BroadcastCallback): this {
    if (type === 'broadcast' && typeof filter === 'string') {
      this.broadcastListeners.push({ event: filter, callback });
    }
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    callback?.('SUBSCRIBED');
    this.connect(callback);
    return this;
  }

  async send(options: { type: string; event: string; payload: unknown }): Promise<CallDelivery> {
    if (!GATEWAY_URL) return { ok: false, delivered: 0 };
    const token = getToken();
    try {
      const res = await fetch(`${GATEWAY_URL}/api/realtime/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          channel: this.channelName,
          event: options.event,
          payload: options.payload,
          excludeConnId: this.self ? undefined : this.connId,
        }),
      });
      if (!res.ok) {
        console.error('[Realtime] Publish failed:', res.status);
        return { ok: false, delivered: 0 };
      }
      try {
        const json = await res.json();
        return {
          ok: true,
          delivered: typeof json?.delivered === 'number' ? json.delivered : 0,
        };
      } catch {
        return { ok: true, delivered: 0 };
      }
    } catch (err) {
      console.error('[Realtime] Publish error:', err);
      return { ok: false, delivered: 0 };
    }
  }

  unsubscribe(): void {
    this.disposed = true;
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    this.controller?.abort();
    this.controller = null;
    this.broadcastListeners = [];
  }

  private async connect(callback?: (status: string) => void): Promise<void> {
    if (this.disposed || !GATEWAY_URL) return;

    const url = `${GATEWAY_URL}/api/realtime/subscribe/${encodeURIComponent(this.channelName)}`;
    let token = getToken();
    if (!token) {
      this.scheduleReconnect(callback);
      return;
    }

    const controller = new AbortController();
    this.controller = controller;

    const fetchStream = async (authToken: string): Promise<Response> =>
      fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
        signal: controller.signal,
      });

    let res: Response;
    try {
      res = await fetchStream(token);
    } catch {
      if (!this.disposed) this.scheduleReconnect(callback);
      return;
    }

    if (res.status === 401) {
      await gateway.auth.refreshSession();
      token = getToken();
      if (!token) {
        this.scheduleReconnect(callback);
        return;
      }
      try {
        res = await fetchStream(token);
      } catch {
        if (!this.disposed) this.scheduleReconnect(callback);
        return;
      }
    }

    if (!res.ok || !res.body) {
      this.scheduleReconnect(callback);
      return;
    }

    this.retryDelay = 1000;
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
      // Stream error — handled by reconnect below.
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
        const parsed = JSON.parse(data);
        this.connId = parsed?.connId ?? null;
      } catch {
        // ignore malformed init frame
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

    for (const listener of this.broadcastListeners) {
      if (listener.event === evt) {
        try {
          listener.callback({ payload: parsed?.payload });
        } catch {
          // ignore handler errors
        }
      }
    }
  }

  private scheduleReconnect(callback?: (status: string) => void): void {
    if (this.disposed) return;
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    this.retryTimeout = setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 2, 30000);
      this.connect(callback);
    }, this.retryDelay);
  }
}

export function openCallChannel(name: string, config?: CallChannelConfig): CallRealtimeChannel {
  return new CallRealtimeChannel(name, config);
}

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
    if (type === 'broadcast') {
      const event = typeof filter === 'string' ? filter : (filter as Record<string, unknown>).event as string;
      if (event) {
        this.broadcastListeners.push({ event, callback });
      }
    }
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    callback?.('SUBSCRIBED');
    this.connect(callback);
    return this;
  }

  async send(options: { type: string; event: string; payload: unknown }): Promise<CallDelivery> {
    if (!GATEWAY_URL) {
      console.error('[Realtime] send() failed: VITE_API_GATEWAY_URL is not set');
      return { ok: false, delivered: 0 };
    }
    let token = getToken();
    if (!token) {
      console.error('[Realtime] send() failed: no auth token');
      return { ok: false, delivered: 0 };
    }

    const post = async (authToken: string) =>
      fetch(`${GATEWAY_URL}/api/realtime/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          channel: this.channelName,
          event: options.event,
          payload: options.payload,
          excludeConnId: this.self ? undefined : this.connId,
        }),
      });

    try {
      console.log(`[Realtime] Publishing to ${this.channelName} event=${options.event}`);
      let res = await post(token);

      if (res.status === 401) {
        console.warn('[Realtime] Publish 401 — refreshing token');
        await gateway.auth.refreshSession();
        token = getToken();
        if (!token) {
          console.error('[Realtime] Publish failed: token refresh returned no token');
          return { ok: false, delivered: 0 };
        }
        res = await post(token);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[Realtime] Publish failed: ${res.status} ${body}`);
        return { ok: false, delivered: 0 };
      }
      try {
        const json = await res.json();
        console.log(`[Realtime] Publish OK: delivered=${json?.delivered}`);
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
    if (this.disposed) return;
    if (!GATEWAY_URL) {
      console.error('[Realtime] connect() failed: VITE_API_GATEWAY_URL is not set');
      return;
    }

    const url = `${GATEWAY_URL}/api/realtime/subscribe/${encodeURIComponent(this.channelName)}`;
    console.log(`[Realtime] SSE connecting to ${url}`);
    let token = getToken();
    if (!token) {
      console.warn(`[Realtime] SSE connect: no token, scheduling reconnect`);
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
      console.log(`[Realtime] SSE response status: ${res.status}`);
    } catch (err) {
      console.error(`[Realtime] SSE fetch failed:`, err);
      if (!this.disposed) this.scheduleReconnect(callback);
      return;
    }

    if (res.status === 401) {
      console.warn('[Realtime] SSE 401 — refreshing token');
      await gateway.auth.refreshSession();
      token = getToken();
      if (!token) {
        this.scheduleReconnect(callback);
        return;
      }
      try {
        res = await fetchStream(token);
        console.log(`[Realtime] SSE retry response status: ${res.status}`);
      } catch {
        console.error(`[Realtime] SSE retry fetch failed`);
        if (!this.disposed) this.scheduleReconnect(callback);
        return;
      }
    }

    if (!res.ok || !res.body) {
      console.warn(`[Realtime] SSE not OK or no body: status=${res.status}`);
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

    console.log('[Realtime] SSE stream connected');
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

    console.log('[Realtime] SSE stream ended');
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
        console.log(`[Realtime] Received event: ${evt}`);
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
    console.log(`[Realtime] Reconnecting in ${this.retryDelay}ms`);
    this.retryTimeout = setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 2, 30000);
      this.connect(callback);
    }, this.retryDelay);
  }
}

export function openCallChannel(name: string, config?: CallChannelConfig): CallRealtimeChannel {
  return new CallRealtimeChannel(name, config);
}

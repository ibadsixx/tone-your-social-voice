// Tone Live — signaling WebSocket client.
//
// Browser WebSocket APIs cannot set an Authorization header, so this client:
//   1. fetches a short-lived, single-use ticket over authenticated HTTP;
//   2. opens wss://<dataClient>/functions/v1/live/signaling?ticket=...&after=<cursor>;
//   3. never puts a long-lived access token or secret in the WebSocket URL.
//
// Reconnects obtain a fresh ticket and resend the durable delivery cursor so
// messages are not lost or replayed across Function instance rotations.

import { dataClient } from '@/lib/supabase/dataClient';
import type { InboundP2PSignal, OutboundP2PSignal } from './liveP2P';

export type SignalingConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface LiveSignalingClientOptions {
  edgeBaseUrl: string;
  sessionId: string;
  getAuthToken: () => string | null;
  onMessage: (message: InboundP2PSignal) => void;
  onConnectionStateChange: (state: SignalingConnectionState) => void;
  maxReconnectAttempts?: number;
}

interface TicketResponse {
  ticket: string;
  sessionId: string;
  userId: string;
  role: string;
  expiresAt: string;
}

interface ServerFrame extends Partial<InboundP2PSignal> {
  type: string;
  sequence?: number;
  code?: string;
  timestamp?: string;
}

function toWebSocketUrl(httpUrl: string): string {
  return httpUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://').replace(/\/$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LiveSignalingClient {
  private socket: WebSocket | null = null;
  private closed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private afterSeq = 0;
  private readonly maxReconnectAttempts: number;

  constructor(private readonly options: LiveSignalingClientOptions) {
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
  }

  /** Last durable cursor received from the Edge Function. */
  getCursor(): number {
    return this.afterSeq;
  }

  async connect(): Promise<void> {
    if (this.closed) return;
    this.options.onConnectionStateChange(this.reconnectAttempts === 0 ? 'connecting' : 'reconnecting');

    try {
      const ticket = await this.fetchTicket();
      if (this.closed) return;
      this.openSocket(ticket);
    } catch (error) {
      this.options.onConnectionStateChange('failed');
      throw error;
    }
  }

  private async fetchTicket(allowRefresh = true): Promise<TicketResponse> {
    const token = this.options.getAuthToken();
    if (!token) throw new Error('Authentication required for live signaling');

    const response = await fetch(
      `${this.options.edgeBaseUrl}/functions/v1/live/sessions/${encodeURIComponent(this.options.sessionId)}/signaling-ticket`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (response.status === 401 && allowRefresh) {
      try {
        await dataClient.auth.refreshSession();
        return this.fetchTicket(false);
      } catch {
        // fall through to the error below
      }
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || `Signaling ticket failed (${response.status})`);
    }
    return response.json() as Promise<TicketResponse>;
  }

  private openSocket(ticket: TicketResponse): void {
    const base = toWebSocketUrl(this.options.edgeBaseUrl);
    const url = `${base}/functions/v1/live/signaling?ticket=${encodeURIComponent(ticket.ticket)}&after=${this.afterSeq}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      // The Edge Function sends a `connected` frame after consuming the ticket; we
      // treat the socket open as connected and refine the cursor on that frame.
      this.reconnectAttempts = 0;
      this.options.onConnectionStateChange('connected');
    });

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data)) as ServerFrame;
      } catch {
        return;
      }

      if (frame.type === 'connected') {
        if (typeof frame.sequence === 'number' && frame.sequence > this.afterSeq) {
          this.afterSeq = frame.sequence;
        }
        return;
      }
      if (frame.type === 'error') {
        console.warn('[LiveSignaling] server error:', frame.code);
        return;
      }
      if (typeof frame.sequence === 'number' && frame.sequence > this.afterSeq) {
        this.afterSeq = frame.sequence;
      }
      if (frame.id && frame.fromUserId && frame.type) {
        this.options.onMessage(frame as InboundP2PSignal);
      }
    });

    socket.addEventListener('close', (event: CloseEvent) => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.closed) return;
      // 4000 = deliberate Function rotation; any close triggers resubscription.
      void this.scheduleReconnect(event.code);
    });

    socket.addEventListener('error', () => {
      // The close handler performs the reconnect; avoid double scheduling.
    });
  }

  private async scheduleReconnect(_code: number): Promise<void> {
    this.options.onConnectionStateChange('reconnecting');
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.options.onConnectionStateChange('failed');
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    await sleep(delay);
    if (this.closed) return;
    try {
      await this.connect();
    } catch (error) {
      console.warn('[LiveSignaling] reconnect failed:', (error as Error).message);
      void this.scheduleReconnect(_code);
    }
  }

  /** Send a validated outbound signal. Drops silently when disconnected. */
  send(signal: OutboundP2PSignal): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(signal));
    }
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      try { this.socket.close(1000, 'client_leave'); } catch { /* ignore */ }
      this.socket = null;
    }
  }
}

// Tone Live — UNIT TESTS: signaling client ticket/reconnect security.
// The WebSocket transport is mocked. These are NOT real network tests.
//
// Covers: authenticated ticket exchange, single-use ticket in URL only,
// no long-lived token in the WebSocket URL, cursor resumption on reconnect,
// and outbound signal delivery.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LiveSignalingClient } from './liveSignalingClient';

vi.mock('@/lib/gateway', () => ({
  gateway: { auth: { refreshSession: vi.fn(async () => ({})) } },
}));

const OPEN = 1;
const sockets: FakeWebSocket[] = [];

class FakeWebSocket {
  static readonly OPEN = OPEN;
  readyState = OPEN;
  sent: string[] = [];
  closed = false;
  private readonly handlers = new Map<string, Array<(event: unknown) => void>>();

  constructor(public readonly url: string) {
    sockets.push(this);
  }
  addEventListener(type: string, handler: (event: unknown) => void): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }
  emit(type: string, event: unknown = {}): void {
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }
  send(data: string): void { this.sent.push(data); }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
}

let fetchMock: ReturnType<typeof vi.fn>;

function ticketResponse(ticket: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ticket,
      sessionId: 'session-1',
      userId: 'user-a',
      role: 'host',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  sockets.length = 0;
  fetchMock = vi.fn(async () => ticketResponse(`TICKET-${sockets.length + 1}`));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Tone Live signaling client', () => {
  it('exchanges an authenticated HTTP ticket and never puts the access token in the URL', async () => {
    const states: string[] = [];
    const client = new LiveSignalingClient({
      gatewayUrl: 'https://gateway.example',
      sessionId: 'session-1',
      getAuthToken: () => 'LONG_LIVED_ACCESS_TOKEN',
      onMessage: () => {},
      onConnectionStateChange: (state) => states.push(state),
    });

    await client.connect();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/api/live/sessions/session-1/signaling-ticket');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer LONG_LIVED_ACCESS_TOKEN');

    expect(sockets.length).toBe(1);
    expect(sockets[0].url).toContain('wss://gateway.example/api/live/signaling');
    expect(sockets[0].url).toContain('ticket=TICKET-1');
    expect(sockets[0].url).not.toContain('LONG_LIVED_ACCESS_TOKEN');
    expect(states[0]).toBe('connecting');
    client.close();
  });

  it('resumes from the durable cursor with a fresh single-use ticket after reconnect', async () => {
    const client = new LiveSignalingClient({
      gatewayUrl: 'https://gateway.example',
      sessionId: 'session-1',
      getAuthToken: () => 'ACCESS',
      onMessage: () => {},
      onConnectionStateChange: () => {},
    });

    await client.connect();
    sockets[0].emit('open');
    sockets[0].emit('message', {
      data: JSON.stringify({ type: 'connected', gatewaySeq: 10, id: 'c1', sessionId: 'session-1' }),
    });
    sockets[0].emit('message', {
      data: JSON.stringify({ type: 'offer', gatewaySeq: 12, id: 'm1', sessionId: 'session-1', fromUserId: 'user-b' }),
    });
    expect(client.getCursor()).toBe(12);

    // Function rotation: reconnect with a NEW ticket and the last cursor.
    sockets[0].emit('close', { code: 4000 });
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sockets.length).toBe(2);
    expect(sockets[1].url).toContain('ticket=TICKET-2');
    expect(sockets[1].url).toContain('after=12');
    expect(sockets[1].url).not.toContain('ACCESS');
    client.close();
  });

  it('sends outbound signals only while connected', async () => {
    const client = new LiveSignalingClient({
      gatewayUrl: 'https://gateway.example',
      sessionId: 'session-1',
      getAuthToken: () => 'ACCESS',
      onMessage: () => {},
      onConnectionStateChange: () => {},
    });
    await client.connect();

    const signal = {
      id: 'offer-1', sessionId: 'session-1', toUserId: 'user-b', type: 'offer' as const, sdp: 'v=0',
    };
    client.send(signal);
    expect(sockets[0].sent).toHaveLength(1);
    expect(JSON.parse(sockets[0].sent[0])).toMatchObject(signal);

    client.close();
    client.send(signal);
    expect(sockets[0].sent).toHaveLength(1);
  });
});

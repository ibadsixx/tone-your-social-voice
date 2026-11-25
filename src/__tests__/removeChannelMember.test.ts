// Regression test for the Channel member management spec (messages.md) — the
// frontend helper now calls the server-authoritative `conversations` Edge
// Function; there is no API Gateway URL to construct in the browser.
//
// The Function verifies the caller's central Auth JWT and the caller's role in
// the conversation (owner-only / owner-protected / no self-removal) before it
// performs the write. These tests pin the request shape (Function URL, method,
// Bearer token and operation payload) and the success/error mapping the
// ChannelInfoPanel removal flow relies on.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getEdgeFunctionUrl } from '@/lib/supabase/edgeTransport';

// callEdgeFunction reads the session from the central Auth client, not from
// localStorage. Stub the client so no account or network is involved.
vi.mock('@/lib/supabase/centralAuth', () => ({
  getCentralAuthInitError: () => null,
  getCentralAuthClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) },
  }),
}));

const { removeChannelMember } = await import('@/api/conversations');

const CONVERSATION = 'channel-uuid-0001';
const MEMBER = 'member-uuid-0001';

type RecordedCall = {
  url: string;
  method: string;
  headers: Headers;
  status: number;
  body: any;
};

let recorded: RecordedCall[] = [];

function installFetch(status: number, body: unknown = null) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    recorded.push({
      url,
      method: init?.method || 'GET',
      headers: new Headers(init?.headers as HeadersInit),
      status,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return {
      ok: status < 400,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
    } as Response;
  });
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  recorded = [];
});

describe('removeChannelMember (messages.md member management)', () => {
  it('posts the authenticated removeMember operation to the conversations Edge Function', async () => {
    installFetch(204);

    const result = await removeChannelMember(CONVERSATION, MEMBER);

    expect(result).toEqual({ data: null, error: null });
    expect(recorded).toHaveLength(1);
    expect(recorded[0].method).toBe('POST');
    expect(recorded[0].url).toBe(getEdgeFunctionUrl('conversations'));
    expect(recorded[0].headers.get('Authorization')).toBe('Bearer test-token');
    expect(recorded[0].body).toEqual({
      operation: 'removeMember',
      input: { conversationId: CONVERSATION, memberId: MEMBER },
    });
  });

  it('Returns the Edge Function error verbatim (e.g. owner_protected / not_owner / self_removal)', async () => {
    installFetch(403, { error: 'The channel owner cannot be removed' });

    const result = await removeChannelMember(CONVERSATION, MEMBER);

    expect(result?.error?.message).toBe('The channel owner cannot be removed');
    expect(result?.data).toBeNull();
  });

  it('Falls back to a status-derived message when the response is not JSON', async () => {
    installFetch(404, null);

    const result = await removeChannelMember(CONVERSATION, MEMBER);

    expect(result?.error?.message).toBe('Request failed with status 404');
  });

  it('Refuses missing arguments before any network call', async () => {
    installFetch(204);

    const noConv = await removeChannelMember('', MEMBER);
    const noMember = await removeChannelMember(CONVERSATION, '');
    const neither = await removeChannelMember('', '');

    expect(noConv?.error?.message).toBe('Missing conversation or member id');
    expect(noMember?.error?.message).toBe('Missing conversation or member id');
    expect(neither?.error?.message).toBe('Missing conversation or member id');
    expect(recorded).toHaveLength(0);
  });

  it('Surfaces transport errors without throwing', async () => {
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('network down'); });

    const result = await removeChannelMember(CONVERSATION, MEMBER);

    expect(result?.error?.message).toBe('network down');
  });

  it('sends ids as opaque function input, with no path interpolation', async () => {
    installFetch(204);

    await removeChannelMember('conv/id?kind=channel', 'user/123');

    expect(recorded[0].url).toBe(getEdgeFunctionUrl('conversations'));
    expect(recorded[0].body.input).toEqual({
      conversationId: 'conv/id?kind=channel',
      memberId: 'user/123',
    });
  });
});

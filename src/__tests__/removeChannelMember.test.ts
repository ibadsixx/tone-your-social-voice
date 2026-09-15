// Regression test for the Channel member management spec (messages.md) — the
// frontend DELETE helper for /api/v1/conversations/:id/members/:memberId.
//
// The Gateway owns ALL authorization here (owner-only, owner-protected, no
// self-removal), so this helper is deliberately thin: it shapes the DELETE
// request exactly and surfaces the Gateway's status/errors verbatim. These tests
// pin down the request shape (method, URL, Bearer token) and the success/error
// mapping the ChannelInfoPanel removal flow relies on.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { removeChannelMember } from '@/api/conversations';

const CONVERSATION = 'channel-uuid-0001';
const MEMBER = 'member-uuid-0001';

type RecordedCall = {
  url: string;
  method: string;
  headers: Headers;
  status: number;
  body: unknown;
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
      body: body instanceof Response ? undefined : body,
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
  localStorage.clear();
  recorded = [];
});

describe('removeChannelMember (messages.md member management)', () => {
  it('issues a DELETE to /api/v1/conversations/:id/members/:memberId with the Bearer token', async () => {
    localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh' }));
    installFetch(204);

    const result = await removeChannelMember(CONVERSATION, MEMBER);

    expect(result).toEqual({ data: null, error: null });
    expect(recorded).toHaveLength(1);
    expect(recorded[0].method).toBe('DELETE');
    expect(recorded[0].url).toBe(
      `${import.meta.env.VITE_API_GATEWAY_URL}/api/v1/conversations/${CONVERSATION}/members/${MEMBER}`
    );
    expect(recorded[0].headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('Returns the gateway error verbatim (e.g. owner_protected / not_owner / self_removal)', async () => {
    localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 't', refresh_token: 'r' }));
    installFetch(403, { error: 'The channel owner cannot be removed' });

    const result = await removeChannelMember(CONVERSATION, MEMBER);

    expect(result?.error?.message).toBe('The channel owner cannot be removed');
    expect(result?.error?.code).toBe('403');
  });

  it('Falls back to a status-derived message when the response is not JSON', async () => {
    localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 't', refresh_token: 'r' }));
    installFetch(404, null);

    const result = await removeChannelMember(CONVERSATION, MEMBER);

    expect(result?.error?.message).toBe('Failed to remove member (404)');
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
    localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 't', refresh_token: 'r' }));
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('network down'); });

    const result = await removeChannelMember(CONVERSATION, MEMBER);

    expect(result?.error?.message).toBe('Error: network down');
  });

  it('Serializes conversation and member ids in the URL path', async () => {
    localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 't', refresh_token: 'r' }));
    installFetch(204);

    await removeChannelMember('conv/id?kind=channel', 'user/123');

    expect(recorded[0].url).toContain('/conversations/conv%2Fid%3Fkind%3Dchannel/members/user%2F123');
  });
});
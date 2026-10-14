// Page publishing: a post published while acting as a Page must be associated
// with that page through the existing `page_posts` join table, so it shows up on
// the page even though its author is the admin's user account. The association
// lives in the one shared creation path (useHomeFeed.createPost) so every
// composer that publishes "as a page" links correctly.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useHomeFeed } from '@/hooks/useHomeFeed';

const authState = vi.hoisted(() => ({ user: { id: 'admin-uuid' } as { id: string } | null }));
const toastSpy = vi.hoisted(() => vi.fn());
const createPostSpy = vi.hoisted(() => vi.fn());
const writes = vi.hoisted(() => [] as Array<{ table: string; row: Record<string, unknown> }>);

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/postVisibility', () => ({
  loadFriendIds: vi.fn(async () => new Set<string>()),
  isPostVisibleToViewer: () => true,
}));
vi.mock('@/api', () => ({
  postsApi: {
    getFeedTimeline: vi.fn(async () => ({ data: [], error: null })),
    createPost: createPostSpy,
  },
}));

vi.mock('@/lib/gateway', () => {
  function builder(table: string) {
    const result = { data: [] as unknown[], error: null as Error | null };
    const chain: Record<string, unknown> = {};
    const settle = () => Promise.resolve(result);
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      in: () => chain,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      insert: (row: Record<string, unknown>) => {
        writes.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      },
      delete: () => chain,
      update: () => chain,
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
    });
    return chain;
  }
  return { gateway: { from: (table: string) => builder(table), storage: { from: () => ({}) } } };
});

beforeEach(() => {
  authState.user = { id: 'admin-uuid' };
  toastSpy.mockClear();
  writes.length = 0;
  createPostSpy.mockReset();
  createPostSpy.mockResolvedValue({ data: { id: 'post-1' }, error: null });
});

async function callCreatePost(pageId?: string) {
  const { result } = renderHook(() => useHomeFeed());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.createPost(
      'Hello from a page',
      undefined,
      undefined,
      { type: 'public' },
      undefined,
      undefined,
      undefined,
      undefined,
      pageId,
    );
  });
}

describe('publishing as a page links the post through page_posts', () => {
  it('writes a page_posts row for the given page id', async () => {
    await callCreatePost('page-1');
    expect(writes).toContainEqual({
      table: 'page_posts',
      row: { page_id: 'page-1', post_id: 'post-1', shared_by: 'admin-uuid' },
    });
  });

  it('does not link a personal post (no page id)', async () => {
    await callCreatePost(undefined);
    expect(writes.some((w) => w.table === 'page_posts')).toBe(false);
  });

  it('still creates the post itself in both cases', async () => {
    await callCreatePost('page-1');
    expect(createPostSpy).toHaveBeenCalledTimes(1);
    expect(createPostSpy.mock.calls[0][0]).toMatchObject({
      content: 'Hello from a page',
      user_id: 'admin-uuid',
    });
  });
});

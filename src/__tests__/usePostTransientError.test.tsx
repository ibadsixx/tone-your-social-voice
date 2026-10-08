// Focused tests for the post-fetch state machine in `usePost`.
//
// The bug these lock down: a *transient* read failure (network drop, timeout,
// Gateway 5xx, a malformed temporary body) was collapsed into `notFound`, and
// PublicContentPage pairs `notFound` with `applyNoIndexSeo` - so one failed
// render could de-index a genuinely public post. The states are now separate:
//
//   loading          -> no notFound, no noindex
//   success          -> post set, audience decides indexability downstream
//   confirmed absent -> notFound (genuinely missing / inaccessible / denied)
//   transient error  -> `error` only, NEVER notFound
//
// Run: npx vitest run src/__tests__/usePostTransientError.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockGetPostById = vi.fn();
const mockIsVisible = vi.fn(() => true);
const mockLoadFriendIds = vi.fn(async () => new Set<string>());
const mockToast = vi.fn();

vi.mock('@/api', () => ({
  postsApi: { getPostById: (...args: unknown[]) => mockGetPostById(...args) },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/lib/postVisibility', () => ({
  loadFriendIds: (...args: unknown[]) => mockLoadFriendIds(...args),
  isPostVisibleToViewer: (...args: unknown[]) => mockIsVisible(...args),
}));

import { usePost } from '@/hooks/usePost';

const UUID = '11111111-2222-4333-8444-555555555555';

const post = (over: Record<string, unknown> = {}) => ({
  id: UUID,
  user_id: 'author-1',
  content: 'hello',
  media_url: null,
  created_at: '2026-02-03T10:00:00.000Z',
  type: 'normal_post' as const,
  audience_type: 'public',
  visibility: 'public',
  status: 'published',
  profiles: { username: 'ada', display_name: 'Ada', profile_pic: null },
  ...over,
});

beforeEach(() => {
  mockGetPostById.mockReset();
  mockIsVisible.mockReset().mockReturnValue(true);
  mockLoadFriendIds.mockReset().mockResolvedValue(new Set());
  mockToast.mockReset();
});

// Drive the bounded retry deterministically: fake timers so the short backoff
// is advanced explicitly instead of leaking state updates outside `act`.
const withFakeTimers = async (run: () => Promise<void>) => {
  vi.useFakeTimers();
  try {
    await run();
  } finally {
    vi.useRealTimers();
  }
};

const advanceRetry = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });

describe('usePost state classification', () => {
  it('1/8. a successful public post is loaded (audience decides indexability downstream)', async () => {
    mockGetPostById.mockResolvedValue({ data: post(), error: null });
    const { result } = renderHook(() => usePost(UUID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.post?.id).toBe(UUID);
    expect(result.current.notFound).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockGetPostById).toHaveBeenCalledTimes(1);
  });

  it('A. while the read is still in flight there is no notFound and no error', async () => {
    mockGetPostById.mockResolvedValue({ data: post(), error: null });
    const { result } = renderHook(() => usePost(UUID));
    expect(result.current.loading).toBe(true);
    expect(result.current.notFound).toBe(false);
    expect(result.current.error).toBeNull();
    // Let the in-flight read settle inside act so it does not warn after the test.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.post?.id).toBe(UUID);
    expect(result.current.error).toBeNull();
  });

  it('4. a confirmed absence from an authorized read is notFound, with no error', async () => {
    mockGetPostById.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePost(UUID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.post).toBeNull();
    // A confirmed absence is not retried.
    expect(mockGetPostById).toHaveBeenCalledTimes(1);
  });

  it('5. a transient Gateway error does NOT set notFound and retries once', async () => {
    await withFakeTimers(async () => {
      mockGetPostById.mockResolvedValue({ data: null, error: { message: 'Gateway 503', code: '503' } });
      const { result } = renderHook(() => usePost(UUID));
      await advanceRetry();
      expect(result.current.loading).toBe(false);
      expect(result.current.notFound).toBe(false);
      expect(result.current.post).toBeNull();
      expect(result.current.error).toBe('Gateway 503');
      // A small bounded retry - not endless polling.
      expect(mockGetPostById).toHaveBeenCalledTimes(2);
    });
  });

  it('5b. a thrown transport error does NOT set notFound', async () => {
    await withFakeTimers(async () => {
      mockGetPostById.mockRejectedValue(new Error('network down'));
      const { result } = renderHook(() => usePost(UUID));
      await advanceRetry();
      expect(result.current.loading).toBe(false);
      expect(result.current.notFound).toBe(false);
      expect(result.current.error).toBe('network down');
      expect(result.current.post).toBeNull();
    });
  });

  it('7. a transient error recovers on the bounded retry and the public post loads', async () => {
    await withFakeTimers(async () => {
      mockGetPostById
        .mockResolvedValueOnce({ data: null, error: { message: 'gateway blip', code: '500' } })
        .mockResolvedValueOnce({ data: post(), error: null });
      const { result } = renderHook(() => usePost(UUID));
      await advanceRetry();
      expect(result.current.post?.id).toBe(UUID);
      expect(result.current.notFound).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockGetPostById).toHaveBeenCalledTimes(2);
    });
  });

  it('7b. refetch after a transient error loads the post and clears the error', async () => {
    await withFakeTimers(async () => {
      mockGetPostById.mockResolvedValue({ data: null, error: { message: 'gateway down', code: '502' } });
      const { result } = renderHook(() => usePost(UUID));
      await advanceRetry();
      expect(result.current.error).toBe('gateway down');
      expect(result.current.notFound).toBe(false);

      mockGetPostById.mockResolvedValue({ data: post(), error: null });
      await act(async () => {
        await result.current.refetch();
      });
      expect(result.current.post?.id).toBe(UUID);
      expect(result.current.error).toBeNull();
      expect(result.current.notFound).toBe(false);
    });
  });

  it('8. a row the viewer may not see is reported as notFound (unchanged privacy)', async () => {
    mockGetPostById.mockResolvedValue({ data: post({ audience_type: 'friends' }), error: null });
    mockIsVisible.mockReturnValue(false);
    const { result } = renderHook(() => usePost(UUID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.post).toBeNull();
  });

  it('8b. an absent id is a confirmed absence, not a transient error', async () => {
    const { result } = renderHook(() => usePost(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockGetPostById).not.toHaveBeenCalled();
  });
});
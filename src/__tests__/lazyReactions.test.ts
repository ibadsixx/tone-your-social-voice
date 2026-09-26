// Lazy per-card reads in the Feed (do.md §16: "avoid N+1 queries" and
// "retrieving reaction users when only reaction counts are needed").
//
// The Feed renders one card per post, and each card used to read its own
// reaction aggregate the moment it mounted — so a 24-post feed issued 24
// requests before the reader had scrolled past the second card. These tests pin
// that the read is now deferred to the card's approach to the viewport, that a
// deferred card is not left stranded when it does arrive, and — the part that
// matters most — that the privacy contract of the endpoint is untouched.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const postReactionUsers = vi.fn();
const postReactionCount = vi.fn();

vi.mock('@/lib/gateway', () => ({
  gateway: {
    postReactionUsers: (...a: unknown[]) => postReactionUsers(...a),
    postReactionCount: (...a: unknown[]) => postReactionCount(...a),
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn() }));

const { useReactions } = await import('@/hooks/useReactions');

const AGG = {
  reaction_count: 3,
  reaction_types: { ok: 2, red_heart: 1 },
  users: [],
  viewer_reactions: [],
};

beforeEach(() => {
  postReactionUsers.mockReset();
  postReactionCount.mockReset();
  postReactionUsers.mockResolvedValue({ data: AGG, error: null });
  postReactionCount.mockResolvedValue({ data: AGG, error: null });
});

describe('useReactions defers its read until the caller says the card is worth reading', () => {
  it('issues no request while disabled', async () => {
    renderHook(() => useReactions('p1', 'owner', { enabled: false }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(postReactionUsers).not.toHaveBeenCalled();
    expect(postReactionCount).not.toHaveBeenCalled();
  });

  it('reads once when enabled', async () => {
    const { result } = renderHook(() => useReactions('p1', 'owner', { enabled: true }));
    await waitFor(() => expect(result.current.reactionsCount).toBe(3));

    expect(postReactionUsers).toHaveBeenCalledTimes(1);
    expect(postReactionUsers).toHaveBeenCalledWith('p1', { includeUsers: false });
  });

  it('reads exactly once when the card later comes into view', async () => {
    // The real sequence: a card mounts above the fold, then scrolls near.
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useReactions('p1', 'owner', { enabled }),
      { initialProps: { enabled: false } }
    );
    await act(async () => { await Promise.resolve(); });
    expect(postReactionUsers).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.reactionsCount).toBe(3));

    // Re-rendering must not re-read: the card's data is already in hand.
    rerender({ enabled: true });
    rerender({ enabled: true });
    await act(async () => { await Promise.resolve(); });
    expect(postReactionUsers).toHaveBeenCalledTimes(1);
  });

  it('still reports zero and loads nothing while deferred', async () => {
    const { result } = renderHook(() => useReactions('p1', 'owner', { enabled: false }));
    await act(async () => { await Promise.resolve(); });

    // A deferred card must not render a spinner or a phantom count.
    expect(result.current.loading).toBe(false);
    expect(result.current.reactionsCount).toBe(0);
    expect(result.current.reactionCounts).toEqual([]);
  });

  it('defaults to reading, so callers that opt out are unaffected', async () => {
    const { result } = renderHook(() => useReactions('p1', 'owner'));
    await waitFor(() => expect(result.current.reactionsCount).toBe(3));
    expect(postReactionUsers).toHaveBeenCalledTimes(1);
  });

  it('never asks for reaction identities (§11: only counts are needed)', async () => {
    renderHook(() => useReactions('p1', 'owner', { enabled: true }));
    await waitFor(() => expect(postReactionUsers).toHaveBeenCalled());

    // The identity flag is hard-coded false, and no other reaction read exists.
    for (const call of postReactionUsers.mock.calls) {
      expect(call[1]).toEqual({ includeUsers: false });
    }
  });

  it('reads nothing at all for a card with no post id', async () => {
    renderHook(() => useReactions('', 'owner', { enabled: true }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(postReactionUsers).not.toHaveBeenCalled();
  });
});

describe('useNearViewport falls back to "always visible" without IntersectionObserver', () => {
  it('does not silently drop data in an environment with no observer', async () => {
    // jsdom has no IntersectionObserver. If the latch defaulted to false, every
    // card in every jsdom test would silently stop reading its reactions. The
    // safe default is the old behaviour, not no behaviour.
    const { useNearViewport } = await import('@/hooks/useNearViewport');
    const { result } = renderHook(() => useNearViewport());
    expect(result.current.inView).toBe(true);
  });
});

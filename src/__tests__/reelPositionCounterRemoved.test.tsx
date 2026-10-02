// The reel viewer used to render a `current / total` pill above the video —
// "1 / 5", "2 / 5", and so on — built from the same `reelsList` and `currentIndex`
// that drive prev/next navigation.
//
// The counter went; the navigation did not. That distinction is the whole point
// of these tests: `reelsList` and `currentIndex` are still loaded, still
// maintained, and still decide where prev/next go, they are simply no longer
// printed on screen. So a passing suite here means two different things at once,
// and each is asserted separately below:
//
//   - nothing anywhere in the viewer renders a `N / M` ratio (and the element
//     that used to hold it is gone from the DOM, not merely emptied);
//   - prev/next still navigate, by click and by keyboard, and the buttons are
//     still gated on there being somewhere to go.
//
// The list is deliberately seeded with five reels and the viewer opened on the
// second, because the counter only rendered when `reelsList.length > 1`. A
// single-reel fixture would never have shown it, so it would pass against the
// old code and prove nothing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });

// jsdom has no media playback and leaves `play()` returning undefined, which the
// viewer's `.play().catch(...)` chain trips over.
HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};

const CURRENT_ID = 'reel-2';
/** Five reels, newest first — the shape the viewer's own list query returns. */
const REEL_IDS = ['reel-1', 'reel-2', 'reel-3', 'reel-4', 'reel-5'];

let reel: Record<string, unknown> = {};
let currentUser: { id: string } | null = { id: 'owner-1' };
/** Set false to render a viewer for a reel that is not in the list at all. */
let listAvailable = true;

vi.mock('@/lib/gateway', () => ({
  gateway: {
    from: (table: string) => {
      if (table === 'posts') {
        const self: Record<string, unknown> = {
          select: () => self,
          eq: () => self,
          order: () => self,
          limit: () => self,
          // The viewer fetches its own row with `.single()`.
          single: () => Promise.resolve({ data: reel, error: null }),
          // ...and the navigation list by awaiting the chain, which lands here.
          then: (onDone: (v: unknown) => unknown) =>
            onDone({
              data: listAvailable ? REEL_IDS.map((id) => ({ id })) : [],
              error: null,
            }),
        };
        return self;
      }
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        insert: () => q,
        update: () => q,
        delete: () => q,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        then: (onDone: (v: unknown) => unknown) => onDone({ data: [], error: null }),
      };
      return q;
    },
    postReactionUsers: () =>
      Promise.resolve({ data: { reaction_count: 2, reaction_types: {}, viewer_reactions: [] }, error: null }),
    postReactionCount: () =>
      Promise.resolve({ data: { reaction_count: 2, reaction_types: {} }, error: null }),
    commentReactionCounts: () => Promise.resolve({ data: { counts: {} }, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: currentUser }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/hooks/useSeeLessPreference', () => ({
  useSeeLessPreference: () => ({ hideReel: vi.fn(), isLoading: false }),
}));
vi.mock('@/components/modals/SendPostModal', () => ({ SendPostModal: () => null }));
vi.mock('@/components/modals/SharePostModal', () => ({ SharePostModal: () => null }));
vi.mock('@/components/PostCommentsPanel', () => ({ default: () => null }));
vi.mock('@/components/reels/ReelFeedbackModal', () => ({ default: () => null }));
vi.mock('@/components/reels/ReelEmbedModal', () => ({ default: () => null }));

import ReelViewer from '@/pages/ReelViewer';
import { clearPostActionsForUser } from '@/lib/postActionCache';

/** Surfaces the current path so navigation can be observed. */
const LocationProbe = () => <div data-testid="path">{useLocation().pathname}</div>;

const renderViewer = (id = CURRENT_ID) =>
  render(
    <MemoryRouter initialEntries={[`/reels/${id}`]}>
      <LocationProbe />
      <Routes>
        <Route path="/reels/:id" element={<ReelViewer />} />
      </Routes>
    </MemoryRouter>
  );

const path = () => screen.getByTestId('path').textContent;

/** Wait until the reel row has rendered, which is past the list having loaded. */
const loaded = () => screen.findByLabelText('Comments');

beforeEach(() => {
  reel = {
    id: CURRENT_ID,
    user_id: 'owner-1',
    media_url: 'https://cdn.test/reel.mp4',
    media_type: 'video',
    duration: 12,
    content: 'my reel',
    created_at: '2026-01-01T00:00:00.000Z',
    audience_type: 'public',
    visibility: 'public',
    status: 'published',
    comments: [{ count: 2 }],
    profiles: { username: 'owner', display_name: 'Owner', profile_pic: null },
  };
  currentUser = { id: 'owner-1' };
  listAvailable = true;
  clearPostActionsForUser('owner-1');
});

afterEach(() => {
  cleanup();
  clearPostActionsForUser('owner-1');
});

describe('the reel viewer prints no position counter', () => {
  it('renders no "current / total" ratio anywhere, with a five-reel list', async () => {
    renderViewer();
    await loaded();

    // The counter only rendered when `reelsList.length > 1`, and opened on the
    // second of five it read "2 / 5". Matched loosely so a differently spaced or
    // differently worded variant ("2 of 5", "2/5") cannot slip past.
    expect(document.body.textContent).not.toMatch(/\d\s*\/\s*\d/);
    expect(document.body.textContent).not.toMatch(/\d\s+of\s+\d/);
  });

  it('leaves no empty counter element behind in the DOM', async () => {
    renderViewer();
    await loaded();

    // Guards against "keep the pill, drop the text". The counter was the only
    // element centred on the horizontal axis — `left-1/2` to position it and
    // `-translate-x-1/2` to pull its centre back over the midpoint. Both are
    // absent from the viewer now, so an empty pill would still trip this.
    expect(document.querySelectorAll('[class*="left-1/2"]')).toHaveLength(0);
    expect(document.querySelectorAll('[class*="translate-x-1/2"]')).toHaveLength(0);
  });

  it('keeps the rest of the overlay, so nothing was removed by accident', async () => {
    renderViewer();
    await loaded();

    // Author, caption, mute, and the action rail all still render.
    await waitFor(() => expect(document.body.textContent).toContain('@owner'));
    expect(document.body.textContent).toContain('my reel');
    await screen.findByLabelText('Mute');
    await screen.findByLabelText('Close');
    // Guests-and-viewers alike keep the public comment action.
    await screen.findByLabelText('Share');
  });

  it('shows no counter even where there is genuinely only one reel', async () => {
    listAvailable = false;
    renderViewer('reel-only');
    await loaded();

    expect(document.body.textContent).not.toMatch(/\d\s*\/\s*\d/);
  });
});

describe('previous/next navigation is untouched by removing the counter', () => {
  // The counter was a read-only view of `reelsList`/`currentIndex`. Deleting it
  // must not have removed the state those buttons navigate with.

  it('still lists the reels and offers both directions from the middle', async () => {
    renderViewer();
    await loaded();

    // Opened on reel-2 of five, so there is somewhere to go in both directions.
    await screen.findByLabelText('Previous reel');
    await screen.findByLabelText('Next reel');
  });

  it('navigates to the next reel when the next button is used', async () => {
    renderViewer();
    await loaded();

    fireEvent.click(await screen.findByLabelText('Next reel'));

    await waitFor(() => expect(path()).toBe('/reels/reel-3'));
  });

  it('navigates to the previous reel when the previous button is used', async () => {
    renderViewer();
    await loaded();

    fireEvent.click(await screen.findByLabelText('Previous reel'));

    await waitFor(() => expect(path()).toBe('/reels/reel-1'));
  });

  it('still navigates by keyboard', async () => {
    renderViewer();
    await loaded();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(path()).toBe('/reels/reel-3'));

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() => expect(path()).toBe('/reels/reel-2'));
  });

  it('still hides a direction that has nowhere to go', async () => {
    // `canGoPrev` is false on the first reel. That gating is what tells us the
    // list and index are still being tracked — a viewer that had forgotten them
    // would either show both arrows or none.
    reel = { ...reel, id: REEL_IDS[0] };
    renderViewer(REEL_IDS[0]);
    await loaded();

    await screen.findByLabelText('Next reel');
    expect(screen.queryByLabelText('Previous reel')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d\s*\/\s*\d/);
  });

  it('offers no navigation at all when the list is empty', async () => {
    listAvailable = false;
    renderViewer('reel-orphan');
    await loaded();

    expect(screen.queryByLabelText('Next reel')).toBeNull();
    expect(screen.queryByLabelText('Previous reel')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d\s*\/\s*\d/);
  });
});
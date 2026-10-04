// `/reels/:id` used to be a second, private implementation of every action a post
// card has: its own `useReelInteractions` hook against `reels_likes` and
// `reels_comments`, its own `ReelCommentsModal`, `ReelShareModal` and
// `ReelMoreMenu`. That is why a Like on a reel did not appear on the post, and why
// the owner could not edit or delete their own reel from its own page.
//
// These tests mount the real viewer and pin the properties that make it the same
// component rather than a lookalike: it renders the shared components, gates the
// account actions the way the post card does, offers Embed only for genuinely
// public content, and reads and writes nothing from the parallel reels tables.
//
// Run: npx vitest run src/__tests__/reelViewerSharedActions.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// jsdom has no ResizeObserver; the options menu and the reaction picker measure
// with one when they open.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });

// jsdom does not implement media playback and leaves `play()` returning undefined,
// which the viewer's `.play().catch(...)` chain trips over. The chrome is not what
// these tests are about.
HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};

const REEL_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_ID = 'owner-1';

/** The reel row the viewer reads. Replaced per test by `serveReel`. */
let reel: Record<string, unknown> = {};
/** Every table the viewer *wrote* to, in order. */
const writes: string[] = [];
/** Every table the viewer read from. */
const reads: string[] = [];
/** The rows the navigation-list read answers with. Overridden per test. */
let navRows: Array<Record<string, unknown>> = [];

function serveReel(overrides: Record<string, unknown> = {}) {
  reel = {
    id: REEL_ID,
    user_id: OWNER_ID,
    media_url: 'https://cdn.test/reel.mp4',
    media_type: 'video',
    duration: 12,
    music_url: null,
    music_source: null,
    music_start: 0,
    music_video_id: null,
    content: 'my reel',
    created_at: '2026-01-01T00:00:00.000Z',
    audience_type: 'public',
    visibility: 'public',
    status: 'published',
    comments: [{ count: 2 }],
    profiles: { username: 'owner', display_name: 'Owner', profile_pic: null },
    ...overrides,
  };
}

/**
 * The viewer's two reads of `posts`: the navigation list and the reel itself.
 * Distinguished by whether an `id` filter has been applied.
 */
const postsQuery = (filters: Record<string, unknown>) => {
  const self: Record<string, unknown> = {
    select: () => self,
    eq: (col: string, val: unknown) => postsQuery({ ...filters, [col]: val }),
    order: () => self,
    limit: () => self,
    single: () =>
      Promise.resolve(
        filters.id ? { data: reel, error: null } : { data: null, error: null }
      ),
    then: (onDone: (v: unknown) => unknown) => {
      reads.push('posts');
      // The navigation list. It carries the audience columns because the viewer
      // filters it with the same rule as every other surface — a reel the viewer
      // may not open must not be one arrow-key away.
      return onDone({ data: navRows.map(r => ({ id: REEL_ID, ...r })), error: null });
    },
  };
  return self;
};

/**
 * Every other table the shared hooks touch: reads answer "nothing here", writes are
 * recorded so a test can assert the viewer invented no persistence of its own.
 */
/** Accepted friendships `loadFriendIds` resolves to. Overridden per test. */
let friendRows: Array<{ requester_id: string; receiver_id: string }> = [];

const tableQuery = (table: string) => {
  const record = (verb: string) => {
    writes.push(`${table}.${verb}`);
    return tableQuery(table);
  };
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    // `loadFriendIds` resolves the viewer's accepted friends with an `or` over
    // requester/receiver before the audience check, so the builder has to accept
    // it. Reading `friends` records no write, so the persistence assertions hold.
    or: () => self,
    order: () => self,
    limit: () => self,
    insert: () => record('insert'),
    update: () => record('update'),
    delete: () => record('delete'),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (onDone: (v: unknown) => unknown) => {
      reads.push(table);
      // `friends` is the one table with real rows: the viewer resolves its
      // accepted friendships from it to evaluate `friends` audience content.
      return onDone({ data: table === 'friends' ? friendRows : [], error: null });
    },
  };
  return self;
};

vi.mock('@/lib/gateway', () => ({
  gateway: {
    from: (table: string) => (table === 'posts' ? postsQuery({}) : tableQuery(table)),
    postReactionUsers: () =>
      Promise.resolve({
        data: { reaction_count: 4, reaction_types: { ok: 4 }, viewer_reactions: [] },
        error: null,
      }),
    postReactionCount: () =>
      Promise.resolve({ data: { reaction_count: 4, reaction_types: { ok: 4 } }, error: null }),
    commentReactionCounts: () => Promise.resolve({ data: { counts: {} }, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

let currentUser: { id: string } | null = { id: OWNER_ID };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: currentUser }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/hooks/useSeeLessPreference', () => ({
  useSeeLessPreference: () => ({ hideReel: vi.fn(), isLoading: false }),
}));

// The shared modals, reduced to a marker. Whether each one opens is the point; what
// it renders once open is the shared component's own business.
vi.mock('@/components/modals/SendPostModal', () => ({
  SendPostModal: ({ isOpen, postId }: { isOpen: boolean; postId: string }) =>
    isOpen ? <div data-testid="send-modal" data-post={postId} /> : null,
}));
vi.mock('@/components/modals/SharePostModal', () => ({
  SharePostModal: ({ isOpen, postId }: { isOpen: boolean; postId: string }) =>
    isOpen ? <div data-testid="share-modal" data-post={postId} /> : null,
}));
vi.mock('@/components/reels/ReelFeedbackModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="feedback-modal" /> : null,
}));
vi.mock('@/components/reels/ReelEmbedModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="embed-modal" /> : null,
}));

// The comment list is the shared panel. Asserting the marker rather than re-testing
// CommentItem, which has its own coverage.
vi.mock('@/components/PostCommentsPanel', () => ({
  default: ({ postId, open }: { postId: string; open: boolean }) =>
    open ? <div data-testid="comments-panel" data-post={postId} /> : null,
}));

import ReelViewer from '@/pages/ReelViewer';

const renderViewer = () =>
  render(
    <MemoryRouter initialEntries={[`/reels/${REEL_ID}`]}>
      <Routes>
        <Route path="/reels/:id" element={<ReelViewer />} />
      </Routes>
    </MemoryRouter>
  );

/** Waits for the reel row to arrive, which is what makes the actions appear. */
const renderLoadedViewer = async () => {
  const view = renderViewer();
  await waitFor(() => expect(screen.getByLabelText('Comments')).toBeTruthy());
  return view;
};

/** Opens the shared options menu. Radix opens on pointerdown, not click. */
const openMenu = async () => {
  const trigger = await screen.findByLabelText('More options');
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  await screen.findByText('Copy link');
};

beforeEach(() => {
  writes.length = 0;
  reads.length = 0;
  currentUser = { id: OWNER_ID };
  serveReel();
  navRows = [
    { id: REEL_ID, user_id: OWNER_ID, audience_type: 'public', visibility: 'public', status: 'published' },
  ];
  friendRows = [];
});

describe('the viewer renders the shared action components', () => {
  it('reads the reel through the Gateway list route, like the feed does', async () => {
    await renderLoadedViewer();
    expect(reads).toContain('posts');
  });

  it('opens the shared comment panel, not a reels-specific one', async () => {
    await renderLoadedViewer();

    fireEvent.click(screen.getByLabelText('Comments'));

    const panel = await screen.findByTestId('comments-panel');
    // Keyed on the same post id, so it is the same thread the feed's card opens —
    // over the `comments` table, not over `reels_comments`.
    expect(panel.getAttribute('data-post')).toBe(REEL_ID);
  });

  it('takes the comment total from the `comments` aggregate', async () => {
    await renderLoadedViewer();

    // `comments (count)` in the viewer's own read — the aggregate the feed uses,
    // not the `comments_count` column the reels tables' triggers maintained.
    expect(screen.getByLabelText('Comments').textContent).toContain('2');
  });

  it('sends and shares through the shared modals', async () => {
    await renderLoadedViewer();

    fireEvent.click(screen.getByLabelText('Send'));
    expect((await screen.findByTestId('send-modal')).getAttribute('data-post')).toBe(REEL_ID);

    fireEvent.click(screen.getByLabelText('Share'));
    expect((await screen.findByTestId('share-modal')).getAttribute('data-post')).toBe(REEL_ID);
  });

  it('shows the gateway reaction total through the shared picker', async () => {
    await renderLoadedViewer();

    // Four reactions, none from the viewer, rendered by `StaticReactionIcon`
    // inside the shared `ReactionPicker` — from the aggregate the Gateway returns,
    // not from a reels-specific read.
    const likeButton = (await screen.findByAltText('Like')).closest('button');
    await waitFor(() => expect(likeButton?.textContent).toContain('4'));
  });
});

describe('guests get the same access as on a post', () => {
  beforeEach(() => {
    currentUser = null;
  });

  it('is offered comment and share, and nothing account-scoped', async () => {
    await renderLoadedViewer();

    // Like, Send, Save and the options menu are account actions. Rendering them
    // for a guest would offer buttons that cannot work.
    expect(screen.getByLabelText('Comments')).toBeTruthy();
    expect(screen.getByLabelText('Share')).toBeTruthy();
    expect(screen.queryByAltText('Like')).toBeNull();
    expect(screen.queryByLabelText('Send')).toBeNull();
    expect(screen.queryByLabelText('Save')).toBeNull();
    expect(screen.queryByLabelText('Unsave')).toBeNull();
    expect(screen.queryByLabelText('More options')).toBeNull();
  });

  it('still reads the public totals', async () => {
    await renderLoadedViewer();

    // A guest is not shown a Like button, but the reaction total is public
    // information and the comment total comes from the reel row itself.
    expect(screen.getByLabelText('Comments').textContent).toContain('2');
  });
});

describe('the options menu applies the post card permission checks', () => {
  it('offers edit and delete to the reel author, and no moderation actions', async () => {
    currentUser = { id: OWNER_ID };
    await renderLoadedViewer();
    await openMenu();

    expect(screen.getByText('Edit post')).toBeTruthy();
    expect(screen.getByText('Delete post')).toBeTruthy();
    expect(screen.queryByText('Report post')).toBeNull();
    expect(screen.queryByText(/^Mute/)).toBeNull();
  });

  it('offers mute and report to a signed-in non-author, and no owner actions', async () => {
    currentUser = { id: 'someone-else' };
    await renderLoadedViewer();
    await openMenu();

    expect(screen.getByText('Report post')).toBeTruthy();
    expect(screen.getByText(/^Mute/)).toBeTruthy();
    expect(screen.queryByText('Edit post')).toBeNull();
    expect(screen.queryByText('Delete post')).toBeNull();
  });

  it('carries the entries the post card has', async () => {
    await renderLoadedViewer();
    await openMenu();

    expect(screen.getByText('Save post')).toBeTruthy();
    expect(screen.getByText('Copy link')).toBeTruthy();
    expect(screen.getByText('Turn on notifications')).toBeTruthy();
  });

  it('adds the reel-only entries without reimplementing them', async () => {
    await renderLoadedViewer();
    await openMenu();

    expect(screen.getByText('See less')).toBeTruthy();
    expect(screen.getByText("Something isn't working")).toBeTruthy();
  });

  it('opens the shared feedback and embed modals from those entries', async () => {
    await renderLoadedViewer();
    await openMenu();

    fireEvent.click(screen.getByText("Something isn't working"));
    expect(await screen.findByTestId('feedback-modal')).toBeTruthy();
  });
});

describe('embed is offered only for content that is genuinely public', () => {
  it('is offered on a public reel', async () => {
    await renderLoadedViewer();
    await openMenu();

    expect(screen.getByText('Embed')).toBeTruthy();
    fireEvent.click(screen.getByText('Embed'));
    expect(await screen.findByTestId('embed-modal')).toBeTruthy();
  });

  it('is withheld on a friends-only reel', async () => {
    serveReel({ audience_type: 'friends' });
    await renderLoadedViewer();
    await openMenu();

    // The row is already filtered by the Gateway, but offering Embed on a
    // friends-only reel would invite publishing it.
    expect(screen.getByText('See less')).toBeTruthy();
    expect(screen.queryByText('Embed')).toBeNull();
  });

  it('is withheld when the legacy visibility contradicts the audience', async () => {
    // `audience_type` says public, `visibility` says friends. The Gateway treats
    // that as not public, so the client must too.
    serveReel({ audience_type: 'public', visibility: 'friends' });
    await renderLoadedViewer();
    await openMenu();

    expect(screen.queryByText('Embed')).toBeNull();
  });

  it('is withheld on an unpublished reel', async () => {
    serveReel({ status: 'draft' });
    await renderLoadedViewer();
    await openMenu();

    expect(screen.queryByText('Embed')).toBeNull();
  });
});

describe('the navigation list is filtered by audience', () => {
  it('keeps a friends-only reel the viewer is actually friends with', async () => {
    navRows = [
      { id: REEL_ID, user_id: OWNER_ID, audience_type: 'public', visibility: 'public', status: 'published' },
      { id: '22222222-2222-2222-2222-222222222222', user_id: 'friend-author', audience_type: 'friends', visibility: 'public', status: 'published' },
    ];
    friendRows = [{ requester_id: OWNER_ID, receiver_id: 'friend-author' }];
    await renderLoadedViewer();

    // The direction is only offered when the list holds more than this reel, so
    // its presence is the assertion: the friends-only entry survived the filter.
    // The three "drops" tests below assert its absence for the same list shape.
    expect(await screen.findByLabelText('Next reel')).toBeTruthy();
  });

  it('drops a friends-only reel the viewer is not friends with', async () => {
    // `friends` answers empty, so nobody is an accepted friend and the reel must
    // not be reachable by the arrow.
    navRows = [
      { id: REEL_ID, user_id: OWNER_ID, audience_type: 'public', visibility: 'public', status: 'published' },
      { id: '33333333-3333-3333-3333-333333333333', user_id: 'stranger', audience_type: 'friends', visibility: 'public', status: 'published' },
    ];
    await renderLoadedViewer();

    // Only this reel survives the filter, so there is no next direction at all.
    await waitFor(() => expect(reads).toContain('posts'));
    expect(screen.queryByLabelText('Next reel')).toBeNull();
  });

  it('drops an only_me reel that belongs to someone else', async () => {
    navRows = [
      { id: REEL_ID, user_id: OWNER_ID, audience_type: 'public', visibility: 'public', status: 'published' },
      { id: '44444444-4444-4444-4444-444444444444', user_id: 'stranger', audience_type: 'only_me', visibility: 'only_me', status: 'published' },
    ];
    await renderLoadedViewer();

    await waitFor(() => expect(reads).toContain('posts'));
    expect(screen.queryByLabelText('Next reel')).toBeNull();
  });

  it("drops someone else's draft from a viewer's list", async () => {
    navRows = [
      { id: REEL_ID, user_id: OWNER_ID, audience_type: 'public', visibility: 'public', status: 'published' },
      { id: '55555555-5555-5555-5555-555555555555', user_id: 'stranger', audience_type: 'public', visibility: 'public', status: 'draft' },
    ];
    await renderLoadedViewer();

    await waitFor(() => expect(reads).toContain('posts'));
    expect(screen.queryByLabelText('Next reel')).toBeNull();
  });

  it('keeps the viewer their own only_me reel', async () => {
    // The owner always sees their own content, in every audience — a private
    // reel of their own must stay reachable or they cannot review it.
    navRows = [
      { id: REEL_ID, user_id: OWNER_ID, audience_type: 'public', visibility: 'public', status: 'published' },
      { id: '66666666-6666-6666-6666-666666666666', user_id: OWNER_ID, audience_type: 'only_me', visibility: 'only_me', status: 'published' },
    ];
    await renderLoadedViewer();

    expect(await screen.findByLabelText('Next reel')).toBeTruthy();
  });
});

describe('the viewer has no persistence of its own', () => {
  it('writes nothing at all on render', async () => {
    await renderLoadedViewer();

    // Nothing to save, mute, notify or delete: every write belongs to the shared
    // hooks, which only write when the viewer actually acts.
    expect(writes).toEqual([]);
  });

  it('saving writes to `saved_posts`, never to a reels table', async () => {
    await renderLoadedViewer();

    fireEvent.click(screen.getByLabelText('Save'));
    await waitFor(() => expect(writes.length).toBeGreaterThan(0));

    expect(writes).toEqual(['saved_posts.insert']);
  });
});

describe('sign-out drops the cached action state', () => {
  it('clears the per-account cache in the sign-out path, before the session ends', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'hooks', 'useAuth.tsx'), 'utf8');

    const clearAt = src.indexOf('clearPostActionsForUser');
    const signOutAt = src.indexOf('gateway.auth.signOut()');
    expect(clearAt).toBeGreaterThan(-1);
    expect(signOutAt).toBeGreaterThan(-1);
    // Reaction, save and comment state is cached for the length of a session, so
    // it has to go when the session does — otherwise the next person to sign in on
    // this device inherits the previous account's likes and bookmarks.
    expect(clearAt).toBeLessThan(signOutAt);
    expect(src).toMatch(/clearPostActionsForUser\(user\?\.id\)/);
  });
});
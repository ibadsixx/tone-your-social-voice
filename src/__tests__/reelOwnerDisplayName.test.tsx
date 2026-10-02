// `/reels/:id` used to label the reel owner with their handle — `@Hadjer` —
// while the post card labelled the same person with `Malak hadjer`. Two views of
// one person, disagreeing, on two screens a reader can reach back and forth
// between.
//
// The fix routes the reel viewer's label through the same field the post card
// already used (`display_name`), with the same fallback. These tests hold that
// line in place. The last describe block is the one that matters most: it renders
// the real `Post` and the real `ReelViewer` over one shared profile and asserts
// the two surfaces print the same string, so the two implementations cannot drift
// apart again without a test failing.
//
// Note what is deliberately *not* asserted: that clicking the name opens the
// profile. On `/reels/:id` it never was a link — the name is a plain span, and
// the rail avatar is a bare div — so there was nothing to preserve and adding
// routing was out of scope. The tests instead pin that no stray profile link got
// introduced and that the username survives on the row for whatever does need to
// route by handle, which is the part of that requirement that is real here.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });

HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};

const REEL_ID = 'reel-1';
const OWNER_ID = 'owner-1';

/** The exact fixture from the brief. */
const MALAK = {
  username: 'Hadjer',
  display_name: 'Malak hadjer',
  profile_pic: null,
};

let profile: Record<string, unknown> = { ...MALAK };

/** Records the column list of every `select` so tests can inspect the real
    query the viewer issues, rather than asserting on its source text. */
const db = vi.hoisted(() => ({ selects: [] as string[] }));

vi.mock('@/lib/gateway', () => ({
  gateway: {
    from: (table: string) => {
      if (table === 'posts') {
        const self: Record<string, unknown> = {
          select: (cols: string) => {
            db.selects.push(cols);
            return self;
          },
          eq: () => self,
          order: () => self,
          limit: () => self,
          single: () => Promise.resolve({ data: reelRow(), error: null }),
          then: (onDone: (v: unknown) => unknown) => onDone({ data: [], error: null }),
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
      Promise.resolve({ data: { reaction_count: 0, reaction_types: {}, viewer_reactions: [] }, error: null }),
    postReactionCount: () =>
      Promise.resolve({ data: { reaction_count: 0, reaction_types: {} }, error: null }),
    commentReactionCounts: () => Promise.resolve({ data: { counts: {} }, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: OWNER_ID } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/hooks/useSeeLessPreference', () => ({
  useSeeLessPreference: () => ({ hideReel: vi.fn(), isLoading: false }),
}));

// --- Post-card-only dependencies. None of them touch the owner label, but the
// card will not mount without them, so they are stubbed rather than exercised.
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
vi.mock('@/hooks/useNearViewport', () => ({
  useNearViewport: () => ({ ref: { current: null }, inView: true }),
}));
vi.mock('@/hooks/useComments', () => ({
  useComments: () => ({
    comments: [],
    addComment: vi.fn(),
    addReply: vi.fn(),
    editComment: vi.fn(),
    deleteComment: vi.fn(),
    toggleReaction: vi.fn(),
    loading: false,
    submitting: false,
    getTopLevelComments: () => [],
    getReplies: () => [],
    getReplyCount: () => 0,
  }),
}));
vi.mock('@/hooks/useReactions', () => ({
  useReactions: () => ({
    userReaction: null,
    reactionsCount: 0,
    reactionCounts: {},
    toggleReaction: vi.fn(),
  }),
}));
vi.mock('@/components/CommentItem', () => ({ CommentItem: () => null }));
vi.mock('@/components/MentionText', () => ({ MentionText: () => null }));
vi.mock('@/components/LocationChip', () => ({ LocationChip: () => null }));
vi.mock('@/components/SharedPost', () => ({ SharedPost: () => null }));
vi.mock('@/components/ReactionUsersModal', () => ({ default: () => null }));
vi.mock('@/components/modals/SendPostModal', () => ({ SendPostModal: () => null }));
vi.mock('@/components/modals/SharePostModal', () => ({ SharePostModal: () => null }));
vi.mock('@/components/PostCommentsPanel', () => ({ default: () => null }));
vi.mock('@/components/reels/ReelFeedbackModal', () => ({ default: () => null }));
vi.mock('@/components/reels/ReelEmbedModal', () => ({ default: () => null }));

import ReelViewer from '@/pages/ReelViewer';
import Post from '@/components/Post';
import { clearPostActionsForUser } from '@/lib/postActionCache';

const reelRow = () => ({
  id: REEL_ID,
  user_id: OWNER_ID,
  media_url: 'https://cdn.test/reel.mp4',
  media_type: 'video',
  duration: 12,
  content: 'a reel',
  created_at: '2026-01-01T00:00:00.000Z',
  audience_type: 'public',
  visibility: 'public',
  status: 'published',
  comments: [{ count: 0 }],
  profiles: profile,
});

const LocationProbe = () => <div data-testid="path">{useLocation().pathname}</div>;

const renderViewer = () =>
  render(
    <MemoryRouter initialEntries={[`/reels/${REEL_ID}`]}>
      <LocationProbe />
      <Routes>
        <Route path="/reels/:id" element={<ReelViewer />} />
      </Routes>
    </MemoryRouter>
  );

const renderPostCard = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Post {...(reelRow() as unknown as React.ComponentProps<typeof Post>)} />
    </MemoryRouter>
  );

/** The viewer has finished its row fetch and painted the overlay. */
const viewerReady = () => screen.findByLabelText('Comments');

beforeEach(() => {
  profile = { ...MALAK };
  db.selects.length = 0;
  clearPostActionsForUser(OWNER_ID);
});

afterEach(() => {
  cleanup();
  clearPostActionsForUser(OWNER_ID);
});

describe('/reels/:id labels the owner with the display name', () => {
  it("shows the display name 'Malak hadjer', not the handle", async () => {
    renderViewer();
    await viewerReady();

    await waitFor(() => expect(document.body.textContent).toContain('Malak hadjer'));
  });

  it('never renders the @username handle', async () => {
    renderViewer();
    await viewerReady();
    await waitFor(() => expect(document.body.textContent).toContain('Malak hadjer'));

    // Not just the brief's example — no `@`-prefixed handle of any casing.
    expect(document.body.textContent).not.toContain('@Hadjer');
    expect(document.body.textContent).not.toMatch(/@\w+/);
  });

  it('shows the display name verbatim, not the username in another casing', async () => {
    // Guards against reaching for the username and prettifying it instead of
    // reading `display_name`. Lowercasing, title-casing or stripping the space
    // would all render a plausible-looking wrong answer.
    renderViewer();
    await viewerReady();

    await waitFor(() => expect(document.body.textContent).toContain('Malak hadjer'));
    expect(document.body.textContent).not.toContain('MALAK HADJER');
    expect(document.body.textContent).not.toContain('Malak Hadjer');
  });

  it('picks the display name when the two fields differ only by case', async () => {
    profile = { username: 'hadjer', display_name: 'Malak Hadjer', profile_pic: null };
    renderViewer();
    await viewerReady();

    await waitFor(() => expect(document.body.textContent).toContain('Malak Hadjer'));
    expect(document.body.textContent).not.toContain('hadjer');
  });

  it("still seeds the avatar from the display name's initial", async () => {
    renderViewer();
    await viewerReady();

    // The viewer paints the owner twice - a 48px avatar in the action rail and
    // an 8px one beside the caption - so both fallbacks are checked. If either
    // reached for the username it would render 'H' next to 'Malak hadjer'.
    await waitFor(() => expect(document.body.textContent).toContain('Malak hadjer'));
    const fallbacks = Array.from(document.querySelectorAll('[class*="bg-gray-700"]'));
    expect(fallbacks).toHaveLength(2);
    for (const el of fallbacks) expect(el.textContent).toBe('M');
  });
});

describe('fallback when display_name is genuinely unavailable', () => {
  // The brief is explicit: fall back the way the app already does, never show
  // `undefined`, an empty label, or a bare `@`.
  //
  // "The way the app already does" is `display_name || 'Unknown'`, which is
  // literally what the post card runs. A whitespace-only display_name therefore
  // renders as spaces on both surfaces, and is left that way here on purpose:
  // a run of spaces is truthy, so tightening it would mean writing a new
  // fallback, and writing it in only one of the two surfaces is precisely the
  // divergence this file exists to prevent. Fixing it properly is an
  // app-wide data-quality question, not a reel-viewer label change.
  const cases: Array<[string, Record<string, unknown>]> = [
    ['null', { username: 'Hadjer', display_name: null, profile_pic: null }],
    ['undefined', { username: 'Hadjer', display_name: undefined, profile_pic: null }],
    ['missing key', { username: 'Hadjer', profile_pic: null }],
    ['empty string', { username: 'Hadjer', display_name: '', profile_pic: null }],
  ];

  it.each(cases)('renders a label, never undefined or empty — %s', async (_label, prof) => {
    profile = prof;
    renderViewer();
    await viewerReady();

    // A fallback of 'Unknown' is what the post card does, and it is what the
    // reel viewer must agree with. Asserting the exact string rather than "some
    // text" is the point: the two surfaces must not each invent a fallback.
    await waitFor(() => expect(document.body.textContent).toContain('Unknown'));
  });

  it('does not fall back to a bare @handle', async () => {
    profile = { username: 'Hadjer', display_name: null, profile_pic: null };
    renderViewer();
    await viewerReady();

    await waitFor(() => expect(document.body.textContent).toContain('Unknown'));
    expect(document.body.textContent).not.toMatch(/@\w+/);
    expect(document.body.textContent).not.toContain('undefined');
  });

  it('survives an owner with no profile at all', async () => {
    profile = {};
    renderViewer();
    await viewerReady();

    // No profile row is a real state (deleted account, unfollowed author). The
    // viewer must still render rather than throwing on `profiles?.username`.
    await waitFor(() => expect(document.body.textContent).toContain('Unknown'));
  });
});

describe('the username is kept where routing needs it, and dropped from the label', () => {
  it('does not introduce a profile link that was not there before', async () => {
    // The brief asks to verify click-to-profile. On this page the name was never
    // a link, so there was nothing to verify — this pins the current state so a
    // future change is a deliberate one rather than a silent drift.
    renderViewer();
    await viewerReady();
    await waitFor(() => expect(document.body.textContent).toContain('Malak hadjer'));

    expect(document.querySelectorAll('a[href*="/profile/"]')).toHaveLength(0);
  });

  it('leaves the reel route and navigation untouched', async () => {
    renderViewer();
    await viewerReady();

    // Still the same route, still a reel, still closable — the label swap is not
    // allowed to have disturbed anything around it.
    expect(screen.getByTestId('path').textContent).toBe(`/reels/${REEL_ID}`);
    await screen.findByLabelText('Close');
    fireEvent.keyDown(window, { key: 'Escape' });
  });

  it('still asks the database for the username, not only the display name', async () => {
    // The username is no longer painted, but it is still selected from the row.
    // Dropping it from the query would quietly break anything that later needs
    // to route by handle, which is exactly the regression the brief warns about.
    renderViewer();
    await viewerReady();

    const profileSelect = db.selects.find((cols) => cols.includes('profiles:user_id'));
    expect(profileSelect).toBeTruthy();
    expect(profileSelect).toMatch(/username/);
    expect(profileSelect).toMatch(/display_name/);
  });
});

describe('the reel viewer and the post card agree on the owner name', () => {
  // The consistency requirement, tested as behaviour rather than as a comment.
  // Same profile object, both real components, the two labels compared directly.

  const ownerLabelIn = (root: HTMLElement, expected: string) => {
    // The label is the only element in each surface that renders the owner's
    // name as plain text, so read it out of the tree rather than from
    // `document.body`, which would pick up the avatar initial as well.
    const texts = Array.from(root.querySelectorAll('p, span')).map(
      (el) => el.textContent?.trim() ?? '',
    );
    return texts.find((t) => t === expected) ?? null;
  };

  it('prints the identical string on both surfaces', async () => {
    const viewer = renderViewer();
    await viewerReady();
    await waitFor(() => expect(document.body.textContent).toContain('Malak hadjer'));
    const fromViewer = ownerLabelIn(viewer.container, 'Malak hadjer');

    viewer.unmount();

    const card = renderPostCard();
    await waitFor(() => expect(card.container.textContent).toContain('Malak hadjer'));
    const fromCard = ownerLabelIn(card.container, 'Malak hadjer');

    expect(fromViewer).toBe('Malak hadjer');
    expect(fromCard).toBe('Malak hadjer');
    expect(fromViewer).toBe(fromCard);
  });

  it('falls back to the same string on both surfaces', async () => {
    profile = { username: 'Hadjer', display_name: null, profile_pic: null };

    const viewer = renderViewer();
    await viewerReady();
    await waitFor(() => expect(document.body.textContent).toContain('Unknown'));
    const fromViewer = ownerLabelIn(viewer.container, 'Unknown');
    viewer.unmount();

    const card = renderPostCard();
    await waitFor(() => expect(card.container.textContent).toContain('Unknown'));
    const fromCard = ownerLabelIn(card.container, 'Unknown');

    expect(fromViewer).toBe('Unknown');
    expect(fromCard).toBe(fromViewer);
  });

  it('the post card still links to the profile by username, as it always did', async () => {
    // The username is not dead weight: on the card it is the routing key. This
    // is the "username stays available for profile links" half of the brief,
    // asserted where it is actually true today.
    renderPostCard();
    await waitFor(() => expect(document.body.textContent).toContain('Malak hadjer'));

    const href = document.querySelector('a[href*="/profile/"]')?.getAttribute('href');
    expect(href).toBe('/profile/Hadjer');
  });
});

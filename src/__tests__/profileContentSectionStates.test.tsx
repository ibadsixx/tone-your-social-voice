// The states a visitor actually sees in a Profile content section
// (do.md 2, 12, 22, 23, 24).
//
// The paging contract is pinned in `profileContentPaging.test.ts` and the
// sentinel in `profileContentSentinel.test.tsx`. This file covers the layer
// between them: the thing on screen. The properties worth pinning are that the
// Profile never becomes a blank loading page, that a failure never takes away
// content the visitor is reading, that there is no "Load more" control left
// anywhere, and that switching tabs preserves each section's feed.
//
// The grids and the post card are stubbed: they have their own suites, and
// stubbing them keeps this one about the section shell.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getProfileContentPage = vi.fn();

vi.mock('@/api/profileContent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/profileContent')>();
  return {
    ...actual,
    getProfileContentPage: (...args: unknown[]) => getProfileContentPage(...args),
  };
});

vi.mock('@/components/Post', () => ({
  default: ({ id, content }: { id: string; content: string }) => (
    <div data-testid="post-card" data-id={id}>
      {content}
    </div>
  ),
}));

vi.mock('@/components/ProfilePhotosGrid', () => ({
  default: ({ posts, loading }: { posts: { id: string }[]; loading?: boolean }) => (
    <div data-testid="photos-grid">
      {loading ? 'skeleton' : posts.map((p) => p.id).join(',')}
    </div>
  ),
}));

vi.mock('@/components/ProfileReelsGrid', () => ({
  default: ({ posts, loading }: { posts: { id: string }[]; loading?: boolean }) => (
    <div data-testid="reels-grid">
      {loading ? 'skeleton' : posts.map((p) => p.id).join(',')}
    </div>
  ),
}));

const { ProfileContentSection } = await import('@/components/ProfileContentSection');

// --- Fixtures --------------------------------------------------------------

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';

function item(id: string) {
  return {
    id,
    user_id: PROFILE_ID,
    content: `body ${id}`,
    media_url: null,
    media_type: null,
    type: 'normal_post',
    created_at: '2026-01-01T00:00:00.000Z',
    profiles: { username: 'owner', display_name: 'Owner', profile_pic: null },
  };
}

interface ScriptedPage {
  items?: unknown[];
  has_more?: boolean;
  next_cursor?: string | null;
}

function ok(page: ScriptedPage = {}) {
  return {
    data: {
      items: page.items ?? [],
      has_more: page.has_more ?? false,
      next_cursor: page.next_cursor ?? null,
      degraded: false,
    },
    error: null,
  };
}

function queue(...pages: ScriptedPage[]) {
  getProfileContentPage.mockReset();
  for (const page of pages) getProfileContentPage.mockResolvedValueOnce(ok(page));
  getProfileContentPage.mockResolvedValue(ok());
}

function section(props: Partial<React.ComponentProps<typeof ProfileContentSection>> = {}) {
  return render(
    <ProfileContentSection
      kind="posts"
      variant="all"
      profileId={PROFILE_ID}
      enabled
      active
      {...props}
    />
  );
}

function ids(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('[data-testid="post-card"]')).map((el) =>
    el.getAttribute('data-id')
  );
}

beforeEach(() => {
  getProfileContentPage.mockReset();
  getProfileContentPage.mockResolvedValue(ok());
});

// --- A. no blank loading page (§12) -----------------------------------------

describe('A. the Profile is never replaced by a loading state', () => {
  it('skeletons the content area while the first item is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    getProfileContentPage.mockReset();
    getProfileContentPage.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));

    section();

    // The section body is already on screen with a skeleton in it; the profile
    // header above it is neither unmounted nor refetched.
    expect(screen.queryByTestId('profile-section-body-all')).not.toBeNull();
    expect(screen.queryByTestId('profile-section-skeleton')).not.toBeNull();

    release(ok({ items: [item('p1')] }));
    await waitFor(() => expect(screen.queryByTestId('post-card')).not.toBeNull());
    expect(screen.queryByTestId('profile-section-skeleton')).toBeNull();
  });

  it('keeps the loaded items while the next one loads', async () => {
    let release: (value: unknown) => void = () => {};
    queue({ items: [item('p1')], has_more: true, next_cursor: 'C1' });
    getProfileContentPage.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));

    const { container } = section();
    await waitFor(() => expect(ids(container)).toEqual(['p1']));

    // The sentinel is on screen in jsdom, so the next request starts by itself.
    await waitFor(() => expect(screen.queryByText('Loading more…')).not.toBeNull());
    expect(ids(container)).toEqual(['p1']);
    expect(screen.queryByTestId('profile-section-skeleton')).toBeNull();

    release(ok({ items: [item('p2')], has_more: false }));
    await waitFor(() => expect(ids(container)).toEqual(['p1', 'p2']));
  });
});

// --- B. there is no "Load more" control left (§2) ---------------------------

describe('B. pagination is driven by the scroll position alone', () => {
  it('renders no button in a healthy section', async () => {
    queue({ items: [item('p1')], has_more: true, next_cursor: 'C1' });

    section();
    await waitFor(() => expect(screen.queryByTestId('post-card')).not.toBeNull());

    // Nothing to click: the next request is the visitor scrolling to the end.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('profile-content-sentinel')).not.toBeNull();
  });

  it('places the sentinel after the content, not before it', async () => {
    queue({ items: [item('p1')], has_more: true, next_cursor: 'C1' });

    const { container } = section();
    await waitFor(() => expect(screen.queryByTestId('post-card')).not.toBeNull());

    const marks = Array.from(container.querySelectorAll('[data-testid]')).map((el) =>
      el.getAttribute('data-testid')
    );
    // A sentinel above the list would fire on mount and page through the
    // profile without the visitor ever scrolling.
    expect(marks.indexOf('profile-content-sentinel')).toBeGreaterThan(marks.indexOf('post-card'));
  });
});

// --- C. the end of the content (§24) ----------------------------------------

describe('C. the end of a section is stated, once, and only when there was content', () => {
  it('says so when a section that had content is exhausted', async () => {
    queue({ items: [item('p1')], has_more: false });

    section();
    await waitFor(() => expect(screen.queryByText("You're all caught up")).not.toBeNull());
  });

  it('shows an empty state instead of a "caught up" note for an empty profile', async () => {
    queue({ items: [], has_more: false });

    section();

    await waitFor(() => expect(screen.queryByText('No posts yet')).not.toBeNull());
    expect(screen.queryByText("You're all caught up")).toBeNull();
  });

  it('uses the wording that matches the section', async () => {
    queue({ items: [], has_more: false });

    const { unmount } = section({ kind: 'shared', variant: 'shared' });
    await waitFor(() => expect(screen.queryByText('No shared posts found')).not.toBeNull());
    unmount();

    section({ kind: 'reels', variant: 'reels' });
    // The reels grid owns its own empty state, so the section must not also
    // claim there are no reels.
    await waitFor(() => expect(screen.queryByTestId('reels-grid')).not.toBeNull());
  });
});

// --- D. a failure keeps what is being read (§23) ----------------------------

describe('D. a failed page never takes away the page above it', () => {
  it('keeps the items and offers a retry for the one that is missing', async () => {
    queue({ items: [item('p1')], has_more: true, next_cursor: 'C1' });
    getProfileContentPage.mockResolvedValueOnce({ data: null, error: { message: 'Gateway unreachable' } });

    const { container } = section();

    await waitFor(() => expect(screen.queryByTestId('profile-content-error')).not.toBeNull());
    expect(ids(container)).toEqual(['p1']);
    expect(screen.queryByText('Gateway unreachable')).not.toBeNull();
  });

  it('retries only the item that was missing', async () => {
    queue({ items: [item('p1')], has_more: true, next_cursor: 'C1' });
    getProfileContentPage.mockResolvedValueOnce({ data: null, error: { message: 'Gateway unreachable' } });
    getProfileContentPage.mockResolvedValueOnce(ok({ items: [item('p2')], has_more: false }));

    const { container } = section();
    await waitFor(() => expect(screen.queryByTestId('profile-content-error')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(ids(container)).toEqual(['p1', 'p2']));
    // The failed cursor is repeated, so p2 is neither duplicated nor skipped.
    const retryCall = getProfileContentPage.mock.calls.at(-1);
    expect((retryCall?.[2] as { cursor: string | null }).cursor).toBe('C1');
  });
});

// --- E. the four sections are independent (§22) -----------------------------

describe('E. switching sections does not disturb the other three', () => {
  it('renders nothing and asks nothing for an inactive section', async () => {
    queue({ items: [item('p1')], has_more: false });

    section({ enabled: false, active: false });
    await Promise.resolve();

    expect(screen.queryByTestId('profile-section-body-all')).toBeNull();
    expect(getProfileContentPage).not.toHaveBeenCalled();
  });

  it('resumes a section without refetching what is already on screen', async () => {
    queue(
      { items: [item('p1')], has_more: true, next_cursor: 'C1' },
      { items: [item('p2')], has_more: false }
    );

    function Tabs() {
      // Two sections, both mounted; only the active one is enabled. This is the
      // shape `FilteredPostsLayout` renders.
      const [active, setActive] = useState<'posts' | 'photos'>('posts');
      return (
        <>
          <button onClick={() => setActive('photos')}>Photos</button>
          <button onClick={() => setActive('posts')}>Posts</button>
          <ProfileContentSection
            kind="posts"
            variant="all"
            profileId={PROFILE_ID}
            enabled={active === 'posts'}
            active={active === 'posts'}
          />
          <ProfileContentSection
            kind="photos"
            variant="photos"
            profileId={PROFILE_ID}
            enabled={active === 'photos'}
            active={active === 'photos'}
          />
        </>
      );
    }

    const { container } = render(<Tabs />);

    await waitFor(() => expect(ids(container)).toEqual(['p1', 'p2']));
    const postsCalls = getProfileContentPage.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Photos' }));
    await waitFor(() => expect(screen.queryByTestId('photos-grid')).not.toBeNull());
    // Photos asked for itself, and only for itself.
    expect(getProfileContentPage).toHaveBeenCalledTimes(postsCalls + 1);
    expect(getProfileContentPage).toHaveBeenLastCalledWith(PROFILE_ID, 'photos', { cursor: null, limit: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Posts' }));

    // The Posts feed is still the two items it had: the cursor was preserved by
    // staying mounted, so nothing was refetched.
    expect(ids(container)).toEqual(['p1', 'p2']);
    expect(getProfileContentPage).toHaveBeenCalledTimes(postsCalls + 1);
  });
});

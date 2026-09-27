// The Profile one-item-at-a-time paging contract (do.md "Profile content pages").
//
// These tests pin the pagination contract of `useProfileContent` — the Profile
// counterpart of `homeFeedInfiniteScroll.test.ts`, and the part of the change
// with the most ways to be quietly wrong:
//
//   * ONE REQUEST = ONE CONTENT ITEM (§3). Every call asks for `limit: 1`, so a
//     request never transfers more than the visitor is about to see.
//   * The position is an opaque CURSOR that threads through the calls (§8) — not
//     an index into a downloaded list, so a post created mid-scroll cannot make
//     a row appear twice or not at all (§9).
//   * Items are APPENDED (§2, §12): loading the next one never blanks the ones
//     on screen, and never re-renders the Profile into a loading state.
//   * One request in flight at a time, however many times the sentinel fires
//     (§10), and an id is never rendered twice whatever the server returns (§11).
//   * A page can come back EMPTY while `has_more` is still true: that is the
//     Gateway saying "I skipped past rows you may not read" (§18, §19). The
//     cursor must still advance so the next public item is reachable, rather
//     than a friends-only post at the head starving the feed forever.
//   * The end of the feed stops asking (§24), and a failure keeps what is
//     already loaded and retries only the missing item (§23).
//   * The four sections are independent (§22), and nothing polls (§26).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const getProfileContentPage = vi.fn();

vi.mock('@/api/profileContent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/profileContent')>();
  return {
    ...actual,
    getProfileContentPage: (...args: unknown[]) => getProfileContentPage(...args),
  };
});

const { useProfileContent, PROFILE_ITEMS_PER_REQUEST } = await import('@/hooks/useProfileContent');

// --- Fixtures --------------------------------------------------------------

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

interface ScriptedPage {
  items?: unknown[];
  has_more?: boolean;
  next_cursor?: string | null;
}

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: OWNER,
    content: `body ${id}`,
    media_url: null,
    media_type: null,
    type: 'normal_post',
    created_at: new Date(Date.UTC(2026, 0, 1)).toISOString(),
    profiles: { username: 'owner', display_name: 'Owner', profile_pic: null },
    shared_post: null,
    ...overrides,
  };
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

/**
 * Script the pages a feed will return, one per request. Anything past the end
 * of the script answers with a terminal empty page, so an unexpected EXTRA
 * request shows up as a call count rather than as a crash inside the hook.
 */
function queue(...pages: ScriptedPage[]) {
  getProfileContentPage.mockReset();
  for (const page of pages) getProfileContentPage.mockResolvedValueOnce(ok(page));
  getProfileContentPage.mockResolvedValue(ok());
}

function failWith(message: string) {
  getProfileContentPage.mockResolvedValueOnce({ data: null, error: { message } });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(
  profileId: string | undefined = OWNER,
  kind: 'posts' | 'photos' | 'reels' | 'shared' = 'posts',
  options: { enabled?: boolean } = {}
) {
  const view = renderHook(
    ({ id, k, enabled }: { id: string | undefined; k: typeof kind; enabled: boolean }) =>
      useProfileContent(id, k, { enabled }),
    { initialProps: { id: profileId, k: kind, enabled: options.enabled !== false } }
  );
  await settle();
  return view;
}

function ids(view: { result: { current: { items: { id: string }[] } } }) {
  return view.result.current.items.map((i) => i.id);
}

beforeEach(() => {
  getProfileContentPage.mockReset();
  getProfileContentPage.mockResolvedValue(ok());
});

// --- A. one request returns one item ---------------------------------------

describe('A. one request = one content item (§3, §8)', () => {
  it('asks for exactly one item, with no cursor, when a section opens', async () => {
    queue({ items: [item('p1')], has_more: true, next_cursor: 'C1' });

    const view = await mount();

    expect(getProfileContentPage).toHaveBeenCalledTimes(1);
    expect(getProfileContentPage).toHaveBeenCalledWith(OWNER, 'posts', { cursor: null, limit: 1 });
    // The spec's constant, not just "a small number".
    expect(PROFILE_ITEMS_PER_REQUEST).toBe(1);
    expect(ids(view)).toEqual(['p1']);
  });

  it('still asks for one item per request after several scrolls', async () => {
    queue(
      { items: [item('p1')], has_more: true, next_cursor: 'C1' },
      { items: [item('p2')], has_more: true, next_cursor: 'C2' },
      { items: [item('p3')], has_more: false }
    );

    const view = await mount();
    await act(async () => { view.result.current.loadMore(); });
    await act(async () => { view.result.current.loadMore(); });

    expect(getProfileContentPage).toHaveBeenCalledTimes(3);
    for (const call of getProfileContentPage.mock.calls) {
      expect((call[2] as { limit: number }).limit).toBe(1);
    }
    expect(ids(view)).toEqual(['p1', 'p2', 'p3']);
  });

  it('feeds each response cursor into the next request', async () => {
    queue(
      { items: [item('p1')], has_more: true, next_cursor: 'C1' },
      { items: [item('p2')], has_more: true, next_cursor: 'C2' },
      { items: [item('p3')], has_more: false }
    );

    const view = await mount();
    await act(async () => { view.result.current.loadMore(); });
    await act(async () => { view.result.current.loadMore(); });

    const cursors = getProfileContentPage.mock.calls.map((call) => (call[2] as { cursor: string | null }).cursor);
    expect(cursors).toEqual([null, 'C1', 'C2']);
  });
});

// --- B. append, never replace ----------------------------------------------

describe('B. items are appended, never replaced (§2, §12)', () => {
  it('keeps what is on screen when the next item arrives', async () => {
    queue(
      { items: [item('p1')], has_more: true, next_cursor: 'C1' },
      { items: [item('p2')], has_more: false }
    );

    const view = await mount();
    await act(async () => { view.result.current.loadMore(); });

    expect(ids(view)).toEqual(['p1', 'p2']);
  });

  it('leaves the loaded items visible while the next one is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    getProfileContentPage.mockReset();
    getProfileContentPage.mockResolvedValueOnce(ok({ items: [item('p1')], has_more: true, next_cursor: 'C1' }));
    getProfileContentPage.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));

    const view = await mount();

    await act(async () => { view.result.current.loadMore(); });

    // The list is still there and still shows one item; only the footer is busy.
    expect(ids(view)).toEqual(['p1']);
    expect(view.result.current.loadingMore).toBe(true);
    expect(view.result.current.loading).toBe(false);

    await act(async () => {
      release(ok({ items: [item('p2')], has_more: false }));
      await Promise.resolve();
    });

    expect(ids(view)).toEqual(['p1', 'p2']);
    expect(view.result.current.loadingMore).toBe(false);
  });
});

// --- C. one request at a time, one copy of each item ------------------------

describe('C. no duplicate requests, no duplicate content (§10, §11)', () => {
  it('collapses three triggers in one tick into a single request', async () => {
    let release: (value: unknown) => void = () => {};
    getProfileContentPage.mockReset();
    getProfileContentPage.mockResolvedValueOnce(ok({ items: [item('p1')], has_more: true, next_cursor: 'C1' }));
    getProfileContentPage.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));

    const view = await mount();

    // An IntersectionObserver can fire several times for one approach to the
    // sentinel, and a laptop waking from sleep can fire focus and visibility in
    // the same tick. None of that may become three requests for one item.
    await act(async () => {
      view.result.current.loadMore();
      view.result.current.loadMore();
      view.result.current.loadMore();
    });
    expect(getProfileContentPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      release(ok({ items: [item('p2')], has_more: false }));
      await Promise.resolve();
    });

    expect(getProfileContentPage).toHaveBeenCalledTimes(2);
    expect(ids(view)).toEqual(['p1', 'p2']);
  });

  it('renders an item once even when the server repeats its id', async () => {
    queue(
      { items: [item('p1')], has_more: true, next_cursor: 'C1' },
      // A repeated id would be a duplicated React key, and a visible duplicate.
      { items: [item('p1')], has_more: true, next_cursor: 'C2' },
      { items: [item('p2')], has_more: false }
    );

    const view = await mount();
    await act(async () => { view.result.current.loadMore(); });
    await act(async () => { view.result.current.loadMore(); });

    const all = ids(view);
    expect(all).toEqual(['p1', 'p2']);
    expect(new Set(all).size).toBe(all.length);
  });
});

// --- D. unauthorized rows are skipped, not stranded (§18, §19) --------------

describe('D. a page with nothing the viewer may read keeps the feed moving (§18, §19)', () => {
  it('asks again from the next cursor when a page comes back empty but more remains', async () => {
    // Exactly the do.md §19 shape: a guest's next authorized item is the public
    // post that follows a run of friends-only ones.
    queue(
      { items: [], has_more: true, next_cursor: 'C1' },
      { items: [item('public-1')], has_more: true, next_cursor: 'C2' },
      { items: [item('public-2')], has_more: false }
    );

    const view = await mount();

    // Delivered WITHOUT any scroll: the empty page was consumed inside the
    // mount request, so the visitor never saw a blank section.
    expect(ids(view)).toEqual(['public-1']);
    expect(getProfileContentPage).toHaveBeenCalledTimes(2);
    // The second round-trip continued from the cursor the empty page advanced.
    expect((getProfileContentPage.mock.calls[1][2] as { cursor: string | null }).cursor).toBe('C1');

    await act(async () => { view.result.current.loadMore(); });
    expect(ids(view)).toEqual(['public-1', 'public-2']);
    expect(getProfileContentPage).toHaveBeenCalledTimes(3);
  });

  it('stops after a bounded run of empty pages instead of asking forever', async () => {
    // The Gateway bounds its own skip rounds, but a misbehaving or mis-pointed
    // response must not turn into an unbounded request loop either.
    for (let i = 0; i < 40; i++) {
      getProfileContentPage.mockResolvedValueOnce(ok({ items: [], has_more: true, next_cursor: `C${i}` }));
    }
    getProfileContentPage.mockResolvedValue(ok());

    const view = await mount();
    for (let i = 0; i < 20; i++) {
      await act(async () => { view.result.current.loadMore(); });
    }

    expect(view.result.current.done).toBe(true);
    expect(view.result.current.hasMore).toBe(false);
    // Bounded: it gave up rather than running all forty scripted pages.
    expect(getProfileContentPage.mock.calls.length).toBeLessThan(40);
  });
});

// --- E. the end of the feed (§24) -------------------------------------------

describe('E. the end of the content stops pagination (§24)', () => {
  it('asks for nothing more once the feed is exhausted', async () => {
    queue({ items: [item('p1')], has_more: false });

    const view = await mount();
    expect(view.result.current.done).toBe(true);
    expect(view.result.current.hasMore).toBe(false);

    await act(async () => { view.result.current.loadMore(); });
    await act(async () => { view.result.current.loadMore(); });

    expect(getProfileContentPage).toHaveBeenCalledTimes(1);
    expect(ids(view)).toEqual(['p1']);
  });

  it('reports a terminal empty page for a section with no content', async () => {
    queue({ items: [], has_more: false });

    const view = await mount();

    expect(ids(view)).toEqual([]);
    expect(view.result.current.done).toBe(true);
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.error).toBeNull();
  });
});

// --- F. a failure never destroys what is loaded (§23) -----------------------

describe('F. a failed request keeps the loaded items and retries only the missing one (§23)', () => {
  it('keeps the items on screen and surfaces the error', async () => {
    queue({ items: [item('p1')], has_more: true, next_cursor: 'C1' });
    failWith('Gateway unreachable');

    const view = await mount();
    await act(async () => { view.result.current.loadMore(); });

    expect(ids(view)).toEqual(['p1']);
    expect(view.result.current.error).toBe('Gateway unreachable');
    expect(view.result.current.loadingMore).toBe(false);
  });

  it('retries the cursor that failed rather than restarting or skipping it', async () => {
    queue({ items: [item('p1')], has_more: true, next_cursor: 'C1' });
    failWith('Gateway unreachable');
    getProfileContentPage.mockResolvedValueOnce(ok({ items: [item('p2')], has_more: false }));

    const view = await mount();
    await act(async () => { view.result.current.loadMore(); });
    expect(view.result.current.error).toBeTruthy();

    await act(async () => { view.result.current.retry(); });

    // The retry repeats C1: re-requesting from the start would duplicate p1,
    // and advancing the cursor would skip p2 for good.
    const lastCall = getProfileContentPage.mock.calls.at(-1);
    expect((lastCall?.[2] as { cursor: string | null }).cursor).toBe('C1');
    expect(ids(view)).toEqual(['p1', 'p2']);
    expect(view.result.current.error).toBeNull();
  });

  it('surfaces an error and no items when the very first request fails', async () => {
    failWith('Gateway unreachable');

    const view = await mount();

    expect(ids(view)).toEqual([]);
    expect(view.result.current.error).toBe('Gateway unreachable');
    expect(view.result.current.loading).toBe(false);
  });
});

// --- G. the four sections are independent (§22) ----------------------------

describe('G. each section owns its own feed (§22)', () => {
  it('asks for nothing while a section is not the active one', async () => {
    queue({ items: [item('p1')], has_more: true, next_cursor: 'C1' });

    await mount(OWNER, 'photos', { enabled: false });

    // All four sections stay mounted so they keep their cursors, but only the
    // active one may touch the network.
    expect(getProfileContentPage).not.toHaveBeenCalled();
  });

  it('starts the section that becomes active, from the top', async () => {
    queue({ items: [item('photo-1')], has_more: true, next_cursor: 'P1' });

    const view = await mount(OWNER, 'photos', { enabled: false });
    expect(getProfileContentPage).not.toHaveBeenCalled();

    view.rerender({ id: OWNER, k: 'photos' as const, enabled: true });
    await settle();

    // Becoming the active section is the trigger: one item, from the top, with
    // no cursor inherited from any other section.
    expect(getProfileContentPage).toHaveBeenCalledTimes(1);
    expect(getProfileContentPage).toHaveBeenCalledWith(OWNER, 'photos', { cursor: null, limit: 1 });
    expect(ids(view)).toEqual(['photo-1']);
  });

  it('drops one section’s items when the visitor switches to another', async () => {
    queue(
      { items: [item('post-1')], has_more: true, next_cursor: 'C1' },
      { items: [item('reel-1')], has_more: false }
    );

    const view = await mount(OWNER, 'posts');
    expect(ids(view)).toEqual(['post-1']);

    view.rerender({ id: OWNER, k: 'reels' as const, enabled: true });
    await settle();

    // A Reels feed must never contain a plain post, and the Posts feed's items
    // are not carried over.
    expect(ids(view)).toEqual(['reel-1']);
    expect(getProfileContentPage).toHaveBeenLastCalledWith(OWNER, 'reels', { cursor: null, limit: 1 });
  });

  it('does not append the previous profile’s content to the next profile', async () => {
    queue({ items: [item('p1')], has_more: true, next_cursor: 'C1' }, { items: [item('p2')], has_more: false });

    const view = await mount(OWNER);
    expect(ids(view)).toEqual(['p1']);

    view.rerender({ id: OTHER, k: 'posts' as const, enabled: true });
    await settle();

    expect(ids(view)).toEqual(['p2']);
    expect(getProfileContentPage).toHaveBeenLastCalledWith(OTHER, 'posts', { cursor: null, limit: 1 });
  });
});

// --- H. nothing polls (§26) -------------------------------------------------

describe('H. the next request comes from the scroll position, not a timer (§26)', () => {
  it('issues no further requests on its own', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout'] });
    try {
      queue(
        { items: [item('p1')], has_more: true, next_cursor: 'C1' },
        { items: [item('p2')], has_more: true, next_cursor: 'C2' }
      );

      const view = renderHook(() => useProfileContent(OWNER, 'posts', { enabled: true }));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
      expect(getProfileContentPage).toHaveBeenCalledTimes(1);

      // Ten minutes of wall clock with the visitor not scrolling: nothing more
      // is requested. A poll would have kept asking.
      await act(async () => { vi.advanceTimersByTime(10 * 60 * 1000); });

      expect(getProfileContentPage).toHaveBeenCalledTimes(1);
      expect(ids(view)).toEqual(['p1']);
    } finally {
      vi.useRealTimers();
    }
  });
});

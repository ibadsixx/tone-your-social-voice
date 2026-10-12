// The /pages listing used to read `follower_count` off the `pages` row, but that
// column does not exist — the real count lives in `page_followers`. Those reads
// resolved to `undefined`, so every card showed 0 followers, and the Following /
// Your Pages badges were never rendered at all. These tests pin the corrected
// data flow: counts derived from the follow relationships, the viewer's own
// follow rows, ownership by `admin_id`, dedupe, and a surfaced error state.

import type * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { usePages, Page, PageListType } from '@/hooks/usePages';
import { PageCard } from '@/components/PageCard';

const authState = vi.hoisted(() => ({ user: null as { id: string } | null }));
const toastSpy = vi.fn();

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));

// Radix's AvatarImage only renders its <img> once the browser reports the image
// as loaded, which never happens under jsdom. Rendering the primitives as plain
// elements lets the test assert the field mapping PageCard is responsible for.
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
  AvatarFallback: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
}));

interface Result {
  data: unknown;
  error: Error | null;
}

const state = vi.hoisted(() => ({
  pages: { data: [] as unknown[], error: null as Error | null },
  page_followers: { data: [] as unknown[], error: null as Error | null },
  page_posts: { data: [] as unknown[], error: null as Error | null },
  writes: [] as Array<{ table: string; op: string; row?: unknown }>,
  gate: null as null | { promise: Promise<void>; release: () => void },
}));

vi.mock('@/lib/gateway', () => {
  const resultFor = (table: string): Result => {
    if (table === 'pages') return state.pages;
    if (table === 'page_posts') return state.page_posts;
    return state.page_followers;
  };

  interface Chain {
    select: () => Chain;
    eq: () => Chain;
    insert: (row: unknown) => Chain;
    delete: () => Chain;
    single: () => Promise<{ data: unknown; error: Error | null }>;
    then: (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
  }

  const builder = (table: string): Chain => {
    const chain: Chain = {
      select: () => chain,
      eq: () => chain,
      insert: (row: unknown) => {
        state.writes.push({ table, op: 'insert', row });
        return chain;
      },
      delete: () => {
        state.writes.push({ table, op: 'delete' });
        return chain;
      },
      single: () => Promise.resolve({ data: { id: 'new-page' }, error: null }),
      then: (onFulfilled, onRejected) => {
        const base = state.gate
          ? state.gate.promise.then(() => resultFor(table))
          : Promise.resolve(resultFor(table));
        return base.then(onFulfilled, onRejected);
      },
    };
    return chain;
  };

  return { gateway: { from: (table: string) => builder(table) } };
});

const VIEWER = 'u1';

const PAGE_ROWS = [
  {
    id: 'p1',
    name: 'Owned page',
    description: 'mine',
    category: 'Business',
    cover_image: null,
    profile_pic: 'https://cdn.example/p1.jpg',
    admin_id: VIEWER,
    created_at: '2026-01-03',
    archived: false,
    // A stale/legacy column that must be ignored.
    follower_count: 999,
  },
  {
    id: 'p2',
    name: 'Followed page',
    description: null,
    category: null,
    cover_image: 'https://cdn.example/cover.jpg',
    profile_pic: null,
    admin_id: 'u2',
    created_at: '2026-01-02',
    archived: false,
  },
  // Duplicate row for p2: must be listed and counted once.
  {
    id: 'p2',
    name: 'Followed page (dup)',
    description: null,
    category: null,
    cover_image: null,
    profile_pic: null,
    admin_id: 'u2',
    created_at: '2026-01-02',
    archived: false,
  },
  {
    id: 'p3',
    name: 'Empty page',
    description: null,
    category: null,
    cover_image: null,
    profile_pic: null,
    admin_id: 'u2',
    created_at: '2026-01-01',
    archived: false,
  },
];

const FOLLOW_ROWS = [
  { page_id: 'p1', user_id: VIEWER, role: 'admin', followed_at: '2026-01-03' },
  { page_id: 'p1', user_id: 'u5', role: 'follower', followed_at: '2026-01-04' },
  // Duplicate follow row for u5: must not inflate the count.
  { page_id: 'p1', user_id: 'u5', role: 'follower', followed_at: '2026-01-04' },
  { page_id: 'p2', user_id: VIEWER, role: 'follower', followed_at: '2026-01-02' },
];

const PAGE_POST_ROWS = [
  { id: 'pp1', page_id: 'p1', post_id: 'post-a' },
  { page_id: 'p1', post_id: 'post-b' },
  // Duplicate link to post-b: must not inflate p1's post count.
  { page_id: 'p1', post_id: 'post-b' },
  { page_id: 'p2', post_id: 'post-c' },
];

beforeEach(() => {
  authState.user = { id: VIEWER };
  toastSpy.mockClear();
  state.pages = { data: PAGE_ROWS, error: null };
  state.page_followers = { data: FOLLOW_ROWS, error: null };
  state.page_posts = { data: PAGE_POST_ROWS, error: null };
  state.writes = [];
  state.gate = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function fetchList(type: PageListType) {
  const { result } = renderHook(() => usePages());
  let list: Page[] = [];
  await act(async () => {
    list = await result.current.fetchPages(type);
  });
  return { result, list };
}

describe('usePages: real follower counts from page_followers', () => {
  it('counts distinct followers and ignores a non-existent pages.follower_count', async () => {
    const { list } = await fetchList('new');
    const byId = new Map(list.map((p) => [p.id, p]));
    expect(byId.get('p1')?.follower_count).toBe(2); // VIEWER + u5, duplicate not double counted
    expect(byId.get('p2')?.follower_count).toBe(1);
    expect(byId.get('p3')?.follower_count).toBe(0); // genuinely empty stays 0
  });

  it('maps the page profile_pic and cover_image from the API rows', async () => {
    const { list } = await fetchList('new');
    const byId = new Map(list.map((p) => [p.id, p]));
    expect(byId.get('p1')?.profile_pic).toBe('https://cdn.example/p1.jpg');
    expect(byId.get('p2')?.profile_pic).toBeNull();
    expect(byId.get('p2')?.cover_image).toBe('https://cdn.example/cover.jpg');
  });

  it('dedupes pages returned twice by the API', async () => {
    const { list } = await fetchList('new');
    expect(list.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('derives the real post count from page_posts without double counting', async () => {
    const { list } = await fetchList('new');
    const byId = new Map(list.map((p) => [p.id, p]));
    expect(byId.get('p1')?.post_count).toBe(2); // post-a + post-b, duplicate link ignored
    expect(byId.get('p2')?.post_count).toBe(1);
    expect(byId.get('p3')?.post_count).toBe(0); // a page with no posts stays 0
  });
});

describe('usePages: a failing page_posts read is a real error', () => {
  it('surfaces the page_posts error rather than reporting 0 posts', async () => {
    state.page_posts = { data: [], error: new Error('Posts down') };
    const { result, list } = await fetchList('new');
    expect(result.current.error).toBe('Posts down');
    expect(list).toEqual([]);
  });
});

describe('usePages: Following and Your Pages use consistent filters', () => {
  it('lists exactly the pages the viewer follows and counts them', async () => {
    const { result, list } = await fetchList('following');
    expect(list.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(result.current.counts.following).toBe(2);
  });

  it('lists owned pages by admin_id and counts them', async () => {
    const { result, list } = await fetchList('owned');
    expect(list.map((p) => p.id)).toEqual(['p1']);
    expect(result.current.counts.owned).toBe(1);
  });

  it('does not treat page ownership as following', async () => {
    const { list } = await fetchList('suggested');
    // Suggested excludes everything the viewer follows (p1, p2).
    expect(list.map((p) => p.id)).toEqual(['p3']);
  });
});

describe('usePages: a failed read is surfaced, not shown as empty', () => {
  it('exposes the API error instead of silently returning an empty list', async () => {
    state.page_followers = { data: [], error: new Error('Followers down') };
    const { result, list } = await fetchList('following');
    expect(result.current.error).toBe('Followers down');
    expect(list).toEqual([]);
  });
});

describe('usePages: membership resolves against the latest viewer', () => {
  it('does not let a signed-out fetch wipe the following list', async () => {
    authState.user = null;
    const { result, rerender } = renderHook(() => usePages());

    let release!: () => void;
    state.gate = { promise: new Promise<void>((res) => { release = res; }), release: () => release() };

    let pending: Page[] = [];
    act(() => {
      void result.current.fetchPages('following').then((rows) => { pending = rows; });
    });

    // Auth resolves while the request is still in flight.
    authState.user = { id: VIEWER };
    rerender();

    await act(async () => {
      state.gate!.release();
      await result.current.fetchPages('following');
    });

    expect(result.current.counts.following).toBe(2);
  });
});

describe('usePages: follow/unfollow write the existing page_followers table', () => {
  it('inserts a follower row and deletes it on unfollow', async () => {
    const { result } = await fetchList('new');

    await act(async () => {
      await result.current.followPage('p3');
    });
    expect(state.writes).toContainEqual({
      table: 'page_followers',
      op: 'insert',
      row: { page_id: 'p3', user_id: VIEWER, role: 'follower' },
    });

    await act(async () => {
      await result.current.unfollowPage('p3');
    });
    expect(state.writes.some((w) => w.table === 'page_followers' && w.op === 'delete')).toBe(true);
  });
});

describe('PageCard profile thumbnail', () => {
  const basePage: Page = {
    id: 'p1',
    name: 'Ada Fans',
    description: 'desc',
    category: null,
    cover_image: null,
    profile_pic: 'https://cdn.example/avatar.jpg',
    admin_id: 'u1',
    created_at: '2026-01-01',
    follower_count: 3,
    post_count: 5,
    is_following: false,
  };

  const renderCard = (page: Page) =>
    render(
      <MemoryRouter>
        <PageCard page={page} onFollow={vi.fn()} onUnfollow={vi.fn()} />
      </MemoryRouter>
    );

  it('renders the page profile picture with object-cover', () => {
    renderCard(basePage);
    const img = screen.getByAltText('Ada Fans profile') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://cdn.example/avatar.jpg');
    expect(img.className).toContain('object-cover');
  });

  it('shows the page initial as a fallback when there is no profile picture', () => {
    renderCard({ ...basePage, profile_pic: null });
    expect(screen.queryByAltText('Ada Fans profile')).toBeNull();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('never renders a cover image, even when the page has one', () => {
    renderCard({ ...basePage, cover_image: 'https://cdn.example/cover.jpg' });
    expect(screen.queryByAltText('Ada Fans cover')).toBeNull();
    expect(document.querySelector('img[src="https://cdn.example/cover.jpg"]')).toBeNull();
  });

  it('shows the real follower and post counts', () => {
    renderCard(basePage);
    expect(screen.getByText(/3 followers/)).toBeTruthy();
    expect(screen.getByText(/5 posts/)).toBeTruthy();
  });

  it('shows the category in parentheses beside the name', () => {
    renderCard({ ...basePage, category: 'Media/News Company' });
    expect(screen.getByText('(Media/News Company)')).toBeTruthy();
  });

  it('omits the category entirely when the page has none', () => {
    renderCard({ ...basePage, category: null });
    expect(screen.queryByText(/^\(/)).toBeNull();
  });
});

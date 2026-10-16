// The /pages/:id detail screen must render through the SAME personal-profile
// template: the shared `ProfileHeader` (in page configuration) and the shared
// `ProfileTabs`/`FilteredPostsLayout` feed — not the old Facebook-style page
// layout with its own cover band, nav bar and separate posts list.
//
// The heavy shell and the network are stubbed; what is under test is the
// component the route actually mounts, and that the page feed it renders is the
// shared feed fed by the page's own data source.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const eqCalls: Array<[string, unknown]> = [];
const fromCalls: string[] = [];

const PAGE = {
  id: 'page-1',
  name: 'Gold Oil Daily',
  description: 'Daily oil, delivered.',
  category: 'Business',
  cover_image: null,
  profile_pic: null,
  admin_id: 'admin-1',
  created_at: '2026-01-01T00:00:00.000Z',
  button_type: null,
  button_url: null,
  archived: false,
};

const TABLES: Record<string, unknown> = {
  pages: [PAGE],
  page_followers: [],
  profiles: [],
  conversations: [],
  conversation_participants: [],
  page_posts: [{ page_id: 'page-1', post_id: 'post-a' }],
  posts: [
    {
      id: 'post-a',
      user_id: 'admin-1',
      content: 'first page post',
      media_url: null,
      media_type: null,
      type: 'normal_post',
      shared_post_id: null,
      created_at: '2026-02-02T00:00:00.000Z',
    },
  ],
};

function createBuilder(data: unknown) {
  const b: any = {};
  for (const m of ['select', 'order', 'limit']) b[m] = () => b;
  b.eq = (...args: [string, unknown]) => {
    eqCalls.push(args);
    return b;
  };
  b.in = () => b;
  b.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : (data ?? null), error: null });
  b.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: Array.isArray(data) ? data : (data ?? null), error: null }).then(resolve, reject);
  return b;
}

vi.mock('@/lib/gateway', () => ({
  gateway: {
    from: (table: string) => {
      fromCalls.push(table);
      return createBuilder(TABLES[table] ?? []);
    },
    removeChannel: () => undefined,
  },
}));

const authValue = { user: { id: 'viewer-1' }, loading: false };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authValue }));

// The toast/context hooks must return referentially stable values: PageDetail's
// load effect depends on `toast`, so a fresh function per render would loop.
const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

const pageSwitchValue = { actingPage: null, switchToPage: vi.fn(), switchToPersonal: vi.fn() };
vi.mock('@/contexts/PageSwitchContext', () => ({ usePageSwitch: () => pageSwitchValue }));

const callValue = { initiateCall: vi.fn() };
vi.mock('@/contexts/CallContext', () => ({ useCall: () => callValue }));

const conversationsValue = { getOrCreateDM: vi.fn() };
vi.mock('@/hooks/useConversations', () => ({ useConversations: () => conversationsValue }));

// The shared profile template, rendered as-is so we assert the route really
// mounts them (in page mode). They render their slots so the feed is exercised.
vi.mock('@/components/ProfileHeader', () => ({
  default: (props: any) => (
    <div data-testid="profile-header" data-kind={props.profileKind} data-own={String(props.isOwnProfile)} />
  ),
}));
vi.mock('@/components/ProfileTabs', () => ({
  default: (props: any) => (
    <div data-testid="profile-tabs" data-kind={props.profileKind}>
      <div data-testid="posts-slot">{props.postsContent}</div>
    </div>
  ),
}));
vi.mock('@/components/FilteredPostsLayout', () => ({
  default: (props: any) => {
    filteredProps = props;
    return <div data-testid="filtered-posts-layout" />;
  },
}));
vi.mock('@/components/NewPost', () => ({ default: () => null }));

let filteredProps: any = null;

import PageDetail from '@/pages/PageDetail';

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={['/pages/page-1']}>
      <Routes>
        <Route path="/pages/:id" element={<PageDetail />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PageDetail uses the shared personal-profile template', () => {
  beforeEach(() => {
    eqCalls.length = 0;
    fromCalls.length = 0;
  });

  it('mounts the shared ProfileHeader and ProfileTabs in page mode', async () => {
    renderRoute();

    const header = await screen.findByTestId('profile-header');
    expect(header.getAttribute('data-kind')).toBe('page');

    const tabs = screen.getByTestId('profile-tabs');
    expect(tabs.getAttribute('data-kind')).toBe('page');
  });

  it('renders the page posts through the shared feed layout', async () => {
    renderRoute();

    await screen.findByTestId('filtered-posts-layout');
  });

  it('wires the shared layout to the page_posts link table for this page', async () => {
    renderRoute();

    await screen.findByTestId('filtered-posts-layout');

    // The route hands the shared feed a page-scoped data source and the page
    // identity, so the feed is not a separate page-only implementation.
    expect(filteredProps).not.toBeNull();
    expect(filteredProps.postPage?.id).toBe('page-1');
    expect(typeof filteredProps.fetcher).toBe('function');

    // …and that source reads the page's own rows.
    await filteredProps.fetcher('posts', null, 1);
    expect(fromCalls).toContain('page_posts');
    expect(eqCalls.some(([col, val]) => col === 'page_id' && val === 'page-1')).toBe(true);
  });

  it('drops the old Facebook-style page chrome', async () => {
    renderRoute();

    await screen.findByTestId('profile-tabs');
    // The retired tab bar and the Posts-tab "Intro" aside are gone.
    expect(screen.queryByText('Reviews')).toBeNull();
    expect(screen.queryByText('Intro')).toBeNull();
    expect(screen.queryByText('Photos')).toBeNull();
  });
});

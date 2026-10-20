// A post published "as a Page" must render the PAGE'S name and image, while a
// personal post keeps rendering the personal user's name and image
// (do.md "Page Posts Must Display the Page Name, Not the Owner's Personal Name").
//
// There is no page column on `posts`: a page post is a `posts` row authored by
// the admin's PERSONAL id plus a `page_posts` link. The Gateway resolves the
// owning Page from that link and attaches a `page` object to the row; the shared
// `Post` card prefers it (name/avatar/link) and otherwise falls back to the
// personal profile. These tests pin both halves so the two identities cannot
// drift apart — the page post must never print the admin's personal name, and
// the personal post must never print a page name.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type React from 'react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });

vi.mock('@/hooks/useReactions', () => ({
  useReactions: () => ({ reactions: {}, toggleReaction: () => {} }),
}));
vi.mock('@/hooks/useComments', () => ({
  useComments: () => ({ comments: [], addComment: () => {} }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: () => {} }),
}));
vi.mock('@/lib/gateway', () => ({
  gateway: {
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        insert: () => q,
        update: () => q,
        delete: () => q,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        then: (onDone: (v: unknown) => unknown) => onDone({ data: [], error: null }),
      };
      return q;
    },
  },
}));
vi.mock('@/components/ReactionPicker', () => ({ default: () => null }));
vi.mock('@/components/ReactionsCounter', () => ({ default: () => null }));
vi.mock('@/components/PostMoreMenu', () => ({ default: () => null }));
vi.mock('@/components/modals/SendPostModal', () => ({ SendPostModal: () => null }));
vi.mock('@/components/modals/SharePostModal', () => ({ SharePostModal: () => null }));
vi.mock('@/components/ReactionUsersModal', () => ({ default: () => null }));

import Post from '@/components/Post';

const ADMIN = {
  username: 'badsi',
  display_name: 'Badsi Islam',
  profile_pic: 'https://cdn.test/badsi.jpg',
};

const PAGE = {
  id: 'page-423754ea',
  name: 'Tone',
  cover_image: 'https://cdn.test/tone-cover.jpg',
  profile_pic: 'https://cdn.test/tone-pic.jpg',
};

const basePost = {
  id: 'post-1',
  user_id: 'admin-uuid',
  content: 'hello world',
  media_url: null,
  created_at: '2026-01-01T00:00:00.000Z',
  type: 'normal_post' as const,
  audience_type: 'public',
  profiles: ADMIN,
};

const renderPost = (overrides: Record<string, unknown> = {}) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Post {...({ ...basePost, ...overrides } as unknown as React.ComponentProps<typeof Post>)} />
    </MemoryRouter>
  );

beforeEach(() => cleanup());
afterEach(() => cleanup());

describe('a Page post shows the Page identity, not the admin', () => {
  it('renders the Page name', () => {
    renderPost({ page: PAGE });
    expect(screen.getByText('Tone')).toBeTruthy();
  });

  it('never renders the admin personal name', () => {
    renderPost({ page: PAGE });
    expect(screen.queryByText('Badsi Islam')).toBeNull();
    expect(screen.queryByText('@badsi')).toBeNull();
  });

  it('drives the avatar fallback from the Page name, not the admin', () => {
    renderPost({ page: PAGE });
    // Radix renders no <img> in jsdom, so the stable signal is the fallback
    // initial: the Page's first letter ('T' for Tone), never the admin's ('B').
    const fallbacks = [...document.querySelectorAll('span')].map((s) => s.textContent);
    expect(fallbacks).toContain('T');
    expect(fallbacks).not.toContain('B');
  });

  it('links the author to the Page, not the personal profile', () => {
    renderPost({ page: PAGE });
    const link = document.querySelector('a[href="/pages/page-423754ea"]');
    expect(link).toBeTruthy();
    expect(document.querySelector('a[href="/profile/badsi"]')).toBeNull();
  });
});

describe('a personal post keeps the personal identity', () => {
  it('renders the personal display name and handle', () => {
    renderPost({ page: null });
    expect(screen.getByText('Badsi Islam')).toBeTruthy();
    expect(document.body.textContent).toContain('@badsi');
  });

  it('links the author to the personal profile', () => {
    renderPost({ page: null });
    expect(document.querySelector('a[href="/profile/badsi"]')).toBeTruthy();
  });
});

describe('an embedded shared post shows its own Page identity', () => {
  it('renders the original Page name in the shared card', () => {
    renderPost({
      page: null,
      type: 'shared_post',
      shared_post_id: 'orig-1',
      shared_post: {
        id: 'orig-1',
        content: 'original',
        media_url: null,
        type: 'normal_post',
        created_at: '2026-01-01T00:00:00.000Z',
        page: PAGE,
        profiles: ADMIN,
      },
    });
    // The inner card shows the Page; the outer card shows the personal sharer.
    expect(screen.getByText('Tone')).toBeTruthy();
  });
});

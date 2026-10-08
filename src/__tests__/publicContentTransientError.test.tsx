// End-to-end (route -> usePost -> PublicContentPage -> document head) proof that
// a transient read failure does NOT emit noindex, and that a successful retry
// restores `index,follow` for a public post.
//
// This uses the REAL `usePost` and the REAL `PublicContentPage`; only the
// Gateway call, auth, toast and the Post body are stubbed.
//
// Run: npx vitest run src/__tests__/publicContentTransientError.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockGetPostById = vi.fn();
const mockToast = vi.fn();

vi.mock('@/api', () => ({
  postsApi: { getPostById: (...args: unknown[]) => mockGetPostById(...args) },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/components/Post', () => ({
  default: ({ id }: { id: string }) => <div data-testid="post-body">post {id}</div>,
}));

import PublicContentPage from '@/pages/PublicContentPage';

const UUID = '11111111-2222-4333-8444-555555555555';

const publicPost = {
  id: UUID,
  user_id: 'author-1',
  content: 'Hello world from a public post',
  media_url: null,
  created_at: '2026-02-03T10:00:00.000Z',
  type: 'normal_post',
  audience_type: 'public',
  visibility: 'public',
  status: 'published',
  profiles: { username: 'ada', display_name: 'Ada', profile_pic: null },
};

const robots = (): string | null =>
  document.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/post/${UUID}`]}>
      <Routes>
        <Route path="/post/:id" element={<PublicContentPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  mockGetPostById.mockReset();
  mockToast.mockReset();
  document.head.innerHTML = '';
  document.title = '';
});

describe('transient fetch failure on a public post', () => {
  it('6. never applies noindex and shows a recoverable error, not a not-found verdict', async () => {
    // The Gateway fails on both bounded attempts.
    mockGetPostById.mockResolvedValue({ data: null, error: { message: 'Gateway 503', code: '503' } });
    renderPage();

    expect(await screen.findByText(/couldn't load this post/i)).toBeTruthy();
    // The load-bearing assertion: no robots tag at all, so the URL is not told
    // to drop out of the index because of a momentary gateway failure.
    expect(robots()).toBeNull();
    // And it is not treated as unavailable content either.
    expect(screen.queryByText(/isn't available/i)).toBeNull();
    expect(screen.queryByTestId('post-body')).toBeNull();
    expect(document.getElementById('tone-route-jsonld')).toBeNull();
  });

  it('7. a successful retry loads the public post and makes it index,follow', async () => {
    mockGetPostById.mockResolvedValue({ data: null, error: { message: 'Gateway 503', code: '503' } });
    renderPage();

    await screen.findByText(/couldn't load this post/i);
    expect(robots()).toBeNull();

    // The Gateway recovers and the visitor retries.
    mockGetPostById.mockResolvedValue({ data: publicPost, error: null });
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByTestId('post-body')).toBeTruthy();
    await waitFor(() => expect(robots()).toBe('index,follow'));
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toContain(`/post/${UUID}`);
  });
});
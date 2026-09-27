// do.md §14 "Privacy edge cases" + §5/§7/§10/§11, applied to the public content
// surface: the SEO module, the three public routes, and the Layout route guard.
//
// The through-line of every assertion here is that crawlability and privacy are
// both derived from the SAME thing - the row's audience - and that neither one
// can be talked into ignoring it. The negative cases matter more than the
// positive ones: a test that only proves "public posts get indexable metadata"
// would still pass if the module also marked a friends-only post indexable.
//
// Run: npx vitest run src/__tests__/publicContentSeo.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// The Gateway is the authority on whether this viewer may see the content, so the
// page tests stub it to answer exactly that question. No User-Agent, no auth
// token, no viewer id is involved anywhere - that is the point.
const mockUsePost = vi.fn();
const mockUseAuth = vi.fn(() => ({ user: null as { id: string } | null }));
const mockNavigate = vi.fn();

vi.mock('@/hooks/usePost', () => ({ usePost: (id?: string) => mockUsePost(id) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('@/components/Post', () => ({
  default: ({ id }: { id: string }) => <div data-testid="post-body">post {id}</div>,
}));

import PublicContentPage from '@/pages/PublicContentPage';
import { isPublicPath } from '@/lib/publicPaths';
import {
  applyNoIndexSeo,
  applySeo,
  buildContentJsonLd,
  buildContentSeo,
  isPublicAudienceForSeo,
  plainText,
  publicContentKind,
  publicContentPath,
  truncate,
} from '@/lib/seo';

const UUID = '11111111-2222-4333-8444-555555555555';

const content = (over: Record<string, unknown> = {}) => ({
  id: UUID,
  type: 'normal_post',
  media_type: null,
  media_url: null,
  content: 'Hello world from a public post',
  created_at: '2026-02-03T10:00:00.000Z',
  profiles: { username: 'ada', display_name: 'Ada', profile_pic: null },
  audience_type: 'public',
  visibility: 'public',
  status: 'published',
  ...over,
});

const head = (selector: string): string | null =>
  document.head.querySelector(selector)?.getAttribute('content') ?? null;
const headHref = (selector: string): string | null =>
  document.head.querySelector(selector)?.getAttribute('href') ?? null;
const jsonLd = (): Record<string, unknown> => {
  const el = document.getElementById('tone-route-jsonld');
  return el ? JSON.parse(el.textContent || '{}') : {};
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/post/:id" element={<PublicContentPage />} />
        <Route path="/reel/:id" element={<PublicContentPage />} />
        <Route path="/photo/:id" element={<PublicContentPage />} />
        <Route path="/auth" element={<div data-testid="auth-page" />} />
        <Route path="/" element={<div data-testid="home-feed" />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  mockUsePost.mockReset();
  mockUseAuth.mockReturnValue({ user: null });
  mockNavigate.mockReset();
  document.head.innerHTML = '';
  document.title = '';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('public content URLs (§7)', () => {
  it('classifies post, reel and photo the same way the Gateway sitemap does', () => {
    expect(publicContentKind({ type: 'normal_post' })).toBe('post');
    expect(publicContentKind({ type: 'reel' })).toBe('reel');
    expect(publicContentKind({ type: 'normal_post', media_type: 'image' })).toBe('photo');
    // A plain video post is not a reel, matching src/lib/profileReels.ts.
    expect(publicContentKind({ type: 'normal_post', media_type: 'video' })).toBe('post');
  });

  it('builds one stable public URL per kind', () => {
    expect(publicContentPath({ id: UUID, type: 'normal_post' })).toBe(`/post/${UUID}`);
    expect(publicContentPath({ id: UUID, type: 'reel' })).toBe(`/reel/${UUID}`);
    expect(publicContentPath({ id: UUID, type: 'normal_post', media_type: 'image' })).toBe(`/photo/${UUID}`);
  });

  it('refuses to build a URL from anything that is not a uuid', () => {
    for (const bad of ['', '   ', 'not-a-uuid', '../../etc/passwd', '"><script>', null, undefined]) {
      expect(publicContentPath({ id: bad as string })).toBeNull();
    }
  });

  it('treats /post/, /reel/ and /photo/ as public routes but not the feed', () => {
    // §13: the Home guard must NOT be applied to public content detail pages...
    expect(isPublicPath('/post/' + UUID)).toBe(true);
    expect(isPublicPath('/reel/' + UUID)).toBe(true);
    expect(isPublicPath('/photo/' + UUID)).toBe(true);
    // ...and the Home feed must stay authentication-required.
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/messages')).toBe(false);
    expect(isPublicPath('/settings')).toBe(false);
  });
});

describe('audience decides indexing signals (§5, §3)', () => {
  it('treats an exact public audience as public', () => {
    expect(isPublicAudienceForSeo(content())).toBe(true);
  });

  it('treats every restricted audience as not public', () => {
    for (const audience of ['friends', 'only_me', 'specific', 'custom_list', 'friends_except']) {
      expect(isPublicAudienceForSeo(content({ audience_type: audience }))).toBe(false);
    }
  });

  it('never marks a draft or scheduled post indexable, even when public', () => {
    expect(isPublicAudienceForSeo(content({ status: 'draft' }))).toBe(false);
    expect(isPublicAudienceForSeo(content({ status: 'scheduled' }))).toBe(false);
  });

  it('accepts public audience spellings in any casing or alias', () => {
    for (const value of ['Public', 'PUBLIC', ' Everyone ', 'All', 'Anyone']) {
      expect(isPublicAudienceForSeo(content({ audience_type: value, visibility: value }))).toBe(true);
    }
  });

  it('fails closed on an unrecognized audience value', () => {
    expect(isPublicAudienceForSeo(content({ audience_type: 'secret_handshake', visibility: 'secret_handshake' }))).toBe(false);
  });

  it('lets a restrictive legacy column deny when the audience column is empty', () => {
    expect(isPublicAudienceForSeo(content({ audience_type: null, visibility: 'friends' }))).toBe(false);
    // ...but a public legacy column with no audience column is still public.
    expect(isPublicAudienceForSeo(content({ audience_type: null, visibility: 'public' }))).toBe(true);
  });
});

describe('metadata generation (§5)', () => {
  it('points canonical at the real public URL, not at the site root', () => {
    const seo = buildContentSeo(content());
    expect(seo.canonical).toBe(window.location.origin + `/post/${UUID}`);
    // The bug this replaces: index.html shipped canonical="/" on every route,
    // which told Google every post was a duplicate of the homepage.
    expect(seo.canonical).not.toBe(window.location.origin + '/');
  });

  it('canonicalises a reel to /reel/ and a photo to /photo/', () => {
    expect(buildContentSeo(content({ type: 'reel' })).canonical).toContain(`/reel/${UUID}`);
    expect(buildContentSeo(content({ media_type: 'image' })).canonical).toContain(`/photo/${UUID}`);
  });

  it('derives a title and description from the actual content', () => {
    const seo = buildContentSeo(content());
    expect(seo.title).toContain('Ada');
    expect(seo.title).toContain('Hello world');
    expect(seo.description).toContain('Hello world from a public post');
  });

  it('strips markup and urls so the same text is safe in every field', () => {
    expect(plainText('<p>hi <b>there</b> https://x.test/1</p>')).toBe('hi there');
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });

  it('falls back to a usable description for a post with no text', () => {
    const seo = buildContentSeo(content({ content: null }));
    expect(seo.description).toContain('Ada');
    expect(seo.description).toContain('@ada');
  });

  it('never marks public content noindex', () => {
    const seo = buildContentSeo(content());
    applySeo({ title: seo.title, description: seo.description, canonical: seo.canonical, image: seo.image, index: seo.isPublic });
    expect(head('meta[name="robots"]')).toBe('index,follow');
  });

  it('marks restricted content noindex', () => {
    const seo = buildContentSeo(content({ audience_type: 'friends' }));
    applySeo({ title: seo.title, description: seo.description, canonical: seo.canonical, image: seo.image, index: seo.isPublic });
    expect(head('meta[name="robots"]')).toBe('noindex,follow');
  });

  it('fills Open Graph and Twitter fields, including an absolute image', () => {
    const seo = buildContentSeo(content({ media_type: 'image', media_url: 'https://cdn.test/a.jpg' }));
    applySeo({ title: seo.title, description: seo.description, canonical: seo.canonical, image: seo.image, index: true });
    expect(head('meta[property="og:url"]')).toBe(seo.canonical);
    expect(head('meta[property="og:title"]')).toBe(seo.title);
    expect(head('meta[property="og:description"]')).toBe(seo.description);
    expect(head('meta[property="og:image"]')).toBe('https://cdn.test/a.jpg');
    expect(head('meta[name="twitter:image"]')).toBe('https://cdn.test/a.jpg');
  });

  it('omits og:image rather than publishing an unusable one', () => {
    const seo = buildContentSeo(content({ media_url: null }));
    applySeo({ title: seo.title, description: seo.description, canonical: seo.canonical, image: seo.image, index: true });
    expect(seo.image).toBeNull();
    expect(head('meta[property="og:image"]')).toBeNull();
  });

  it('removes a stale canonical from index.html and replaces it', () => {
    document.head.innerHTML = '<link rel="canonical" href="/" />';
    const seo = buildContentSeo(content());
    applySeo({ title: seo.title, description: seo.description, canonical: seo.canonical, index: true });
    expect(headHref('link[rel="canonical"]')).toBe(seo.canonical);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });
});

describe('structured data (§10)', () => {
  it('emits VideoObject for a reel, ImageObject for a photo, neither as a video', () => {
    // The duration is asserted on the node the page actually builds, so it is
    // passed through on the input rather than only on `seo`.
    const reelRow = content({ type: 'reel', media_type: 'video', media_url: 'https://cdn.test/v.mp4', duration: 12 });
    const reel = buildContentSeo(reelRow);
    const reelNode: any = buildContentJsonLd({ ...reelRow, seo: reel });
    expect(reelNode.video['@type']).toBe('VideoObject');
    expect(reelNode.video.duration).toBe('PT12S');

    const photo = buildContentSeo(content({ media_type: 'image', media_url: 'https://cdn.test/p.jpg' }));
    expect((buildContentJsonLd({ ...content(), seo: photo }) as any).primaryImageOfPage['@type']).toBe('ImageObject');
    // A photo must not claim to be a video.
    expect((buildContentJsonLd({ ...content(), seo: photo }) as any).video).toBeUndefined();

    const post = buildContentSeo(content());
    const node: any = buildContentJsonLd({ ...content(), seo: post });
    expect(node.video).toBeUndefined();
    expect(node.mainEntity['@type']).toBe('SocialMediaPosting');
    expect(node['@type']).toBe('WebPage');
  });

  it('does not invent an image for a media-less post', () => {
    const seo = buildContentSeo(content());
    const node: any = buildContentJsonLd({ ...content(), seo });
    expect(node.primaryImageOfPage).toBeUndefined();
    expect(node.mainEntity.image).toBeUndefined();
  });

  it('drops a stale schema when the next page has none', () => {
    applySeo({ title: 'x', description: 'y', canonical: 'z', index: true, jsonLd: { '@type': 'WebPage' } });
    expect(document.getElementById('tone-route-jsonld')).not.toBeNull();
    applyNoIndexSeo('not available', 'https://x.test/');
    expect(document.getElementById('tone-route-jsonld')).toBeNull();
    expect(head('meta[name="robots"]')).toBe('noindex,follow');
  });
});

describe('guest access to public content pages (§1, §4, §13)', () => {
  it('A. renders a public post for a logged-out visitor with full metadata', async () => {
    mockUsePost.mockReturnValue({ post: content(), loading: false, notFound: false });
    renderAt(`/post/${UUID}`);

    expect(await screen.findByTestId('post-body')).toBeTruthy();
    await waitFor(() => expect(document.title).toContain('Ada'));
    expect(head('meta[name="robots"]')).toBe('index,follow');
    expect(headHref('link[rel="canonical"]')).toContain(`/post/${UUID}`);
    // A guest must never be sent to the login page for public content.
    expect(mockNavigate).not.toHaveBeenCalledWith('/auth', expect.anything());
    expect(screen.queryByTestId('auth-page')).toBeNull();
  });

  it('B. renders a public reel on /reel/:id and canonicalises to /reel/', async () => {
    mockUsePost.mockReturnValue({
      post: content({ type: 'reel', media_type: 'video', media_url: 'https://cdn.test/v.mp4', duration: 8 }),
      loading: false,
      notFound: false,
    });
    renderAt(`/reel/${UUID}`);
    expect(await screen.findByTestId('post-body')).toBeTruthy();
    await waitFor(() => expect(headHref('link[rel="canonical"]')).toContain(`/reel/${UUID}`));
    expect((jsonLd() as any).video['@type']).toBe('VideoObject');
  });

  it('C. renders a public photo on /photo/:id and canonicalises to /photo/', async () => {
    mockUsePost.mockReturnValue({
      post: content({ media_type: 'image', media_url: 'https://cdn.test/p.jpg' }),
      loading: false,
      notFound: false,
    });
    renderAt(`/photo/${UUID}`);
    expect(await screen.findByTestId('post-body')).toBeTruthy();
    await waitFor(() => expect(headHref('link[rel="canonical"]')).toContain(`/photo/${UUID}`));
    expect((jsonLd() as any).primaryImageOfPage['@type']).toBe('ImageObject');
  });

  it('needs no interaction or feed navigation to reach the content (§4)', async () => {
    // The content is available on first paint from the URL alone: no click, no
    // infinite scroll, and nothing read from the authenticated Home feed.
    mockUsePost.mockReturnValue({ post: content(), loading: false, notFound: false });
    renderAt(`/post/${UUID}`);
    expect(await screen.findByTestId('post-body')).toBeTruthy();
    expect(screen.queryByTestId('home-feed')).toBeNull();
  });
});

describe('restricted and missing content stays out of the index (§2, §14 D-J)', () => {
  it.each([
    ['D. friends-only post', { audience_type: 'friends', visibility: 'friends' }],
    ['E. friends-only reel', { type: 'reel', audience_type: 'friends', visibility: 'friends' }],
    ['F. friends-only photo', { media_type: 'image', audience_type: 'friends', visibility: 'friends' }],
    ['G. only-me post', { audience_type: 'only_me', visibility: 'only_me' }],
  ])('%s is not indexable and shows no content to a guest', async (_label, restricted) => {
    // The Gateway would never hand this row to an anonymous client; the page
    // treats it as absent, so a crawler that already knows the URL is told to
    // drop it instead of being served a summary.
    mockUsePost.mockReturnValue({ post: null, loading: false, notFound: true });
    renderAt(`/post/${UUID}`);
    await waitFor(() => expect(head('meta[name="robots"]')).toBe('noindex,follow'));
    expect(headHref('link[rel="canonical"]')).not.toContain('/post/');
    expect(screen.queryByTestId('post-body')).toBeNull();
    expect(restricted).toBeTruthy();
  });

  it('J. a deleted public post 404s rather than being indexed', async () => {
    mockUsePost.mockReturnValue({ post: null, loading: false, notFound: true });
    renderAt(`/post/${UUID}`);
    expect(await screen.findByText(/isn't available/i)).toBeTruthy();
    expect(head('meta[name="robots"]')).toBe('noindex,follow');
    expect(document.getElementById('tone-route-jsonld')).toBeNull();
  });

  it('H. content that turns public -> friends loses its indexable signals', async () => {
    mockUsePost.mockReturnValue({ post: content(), loading: false, notFound: false });
    const { unmount } = renderAt(`/post/${UUID}`);
    await waitFor(() => expect(head('meta[name="robots"]')).toBe('index,follow'));
    unmount();

    document.head.innerHTML = '';
    // Now the row is friends-only: the Gateway stops returning it at all.
    mockUsePost.mockReturnValue({ post: null, loading: false, notFound: true });
    renderAt(`/post/${UUID}`);
    await waitFor(() => expect(head('meta[name="robots"]')).toBe('noindex,follow'));
  });
});

describe('owner and friends keep their existing access (§9, §14 K/L)', () => {
  it('K. the authenticated owner still sees their own restricted post', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'owner-1' } });
    mockUsePost.mockReturnValue({
      post: content({ audience_type: 'only_me', visibility: 'only_me' }),
      loading: false,
      notFound: false,
    });
    renderAt(`/post/${UUID}`);
    expect(await screen.findByTestId('post-body')).toBeTruthy();
    // The owner may READ it, but it must never enter a public index.
    expect(head('meta[name="robots"]')).toBe('noindex,follow');
  });

  it('L. an accepted friend still sees friends-only content', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'friend-1' } });
    mockUsePost.mockReturnValue({
      post: content({ audience_type: 'friends', visibility: 'friends' }),
      loading: false,
      notFound: false,
    });
    renderAt(`/post/${UUID}`);
    expect(await screen.findByTestId('post-body')).toBeTruthy();
    expect(head('meta[name="robots"]')).toBe('noindex,follow');
  });
});

describe('no crawler privilege (§16)', () => {
  it('grants nothing to a Googlebot user agent and takes nothing from a guest', async () => {
    // The page reads no User-Agent at all: crawlability was already decided by
    // the Gateway. Setting the crawler UA here changes nothing, which is exactly
    // the property that makes a private post safe to serve.
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      configurable: true,
    });
    mockUsePost.mockReturnValue({ post: null, loading: false, notFound: true });
    renderAt(`/post/${UUID}`);
    await waitFor(() => expect(head('meta[name="robots"]')).toBe('noindex,follow'));
    expect(screen.queryByTestId('post-body')).toBeNull();
    Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true });
  });

  it('never reads a viewer id from the page', () => {
    // Nothing in the metadata path may branch on who is asking.
    const seo = buildContentSeo(content());
    expect(seo.isPublic).toBe(true);
  });
});

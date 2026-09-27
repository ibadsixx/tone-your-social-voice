// Per-route <head> management for crawlable public content (do.md §5, §7, §10).
//
// Tone is a client-rendered Vite SPA, so the only place a route's metadata can
// exist is the document head, mutated after the route's data resolves. Google's
// crawler executes JavaScript before indexing, so tags written here are read -
// but they have to be *correct*, not merely present. The two things that are
// silently fatal if left wrong:
//
//   canonical  The app's index.html ships <link rel="canonical" href="/"> for
//              every route. A relative canonical of "/" tells Google that every
//              post on the site is a duplicate of the homepage, so the whole
//              catalogue collapses onto one URL and nothing else is indexed.
//              That single wrong tag is the difference between "crawlable" and
//              "invisible".
//   robots     <meta name="robots"> must never become noindex on a public page
//              (do.md §5), and must become noindex on a restricted or missing
//              one, so a crawler that already knows a URL stops spending budget
//              on it.
//
// Everything here is a pure function of the loaded content plus the DOM. No
// network, no auth state, no User-Agent: the Gateway has already decided
// whether this viewer may see this content, and a non-viewer never gets here
// with content in hand.
import { resolveMediaSrc } from '@/lib/mediaUrl';

// --- public content identity -------------------------------------------------

export type PublicContentKind = 'post' | 'reel' | 'photo';

// MUST match gateway/src/features/sitemap.ts PUBLIC_CONTENT_PATH_PREFIX and the
// routes in src/App.tsx. A drift between the sitemap and the router would emit
// URLs that 404, so all three are asserted against these same literals.
export const PUBLIC_CONTENT_PATH_PREFIX: Record<PublicContentKind, string> = {
  post: '/post/',
  reel: '/reel/',
  photo: '/photo/',
};

// A reel is a post whose stored `type` is exactly 'reel' (the same rule as
// src/lib/profileReels.ts - a plain video post is NOT a reel). A photo is a post
// carrying image media. This is the same classifier the Gateway uses, so a
// content page and its sitemap entry always agree on the URL.
export function publicContentKind(row: {
  type?: string | null;
  media_type?: string | null;
}): PublicContentKind {
  if (typeof row.type === 'string' && row.type.trim().toLowerCase() === 'reel') return 'reel';
  if (row.media_type === 'image') return 'photo';
  return 'post';
}

export function publicContentPath(
  row: { id?: string | null; type?: string | null; media_type?: string | null }
): string | null {
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  if (!id) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return `${PUBLIC_CONTENT_PATH_PREFIX[publicContentKind(row)]}${id.toLowerCase()}`;
}

// --- text helpers -----------------------------------------------------------

// Strip the markup a feed post can carry so the same string is safe to put in a
// title, a meta description, and JSON-LD.
export function plainText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const SITE_NAME = 'Tone';

export interface ContentSeoInput {
  id: string;
  type?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  thumbnail?: string | null;
  content?: string | null;
  created_at?: string | null;
  duration?: number | null;
  profiles?: { username?: string | null; display_name?: string | null; profile_pic?: string | null } | null;
  audience_type?: string | null;
  visibility?: string | null;
  status?: string | null;
}

export interface ContentSeo {
  title: string;
  description: string;
  canonical: string;
  image: string | null;
  kind: PublicContentKind;
  isPublic: boolean;
  path: string;
}

// The origin of the running app. Canonical and og:url must be absolute or Google
// discards them, and they must match the host the page was actually served from
// (tonesn.vercel.app in production, localhost in dev) - so this reads the live
// origin rather than a build-time constant that would be wrong in one of the two.
export function siteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = siteOrigin();
  return origin ? `${origin}${path.startsWith('/') ? path : `/${path}`}` : path;
}

// Only a real, absolute image/video URL is published as og:image. An app-relative
// `/media/<id>` is resolved to its CDN source so social platforms can actually
// fetch it, and anything unresolvable is dropped rather than published broken.
function seoImage(input: ContentSeoInput): string | null {
  const candidate = input.thumbnail || input.media_url || null;
  if (!candidate) return null;
  const src = resolveMediaSrc(candidate);
  return /^https?:\/\//i.test(src) ? src : null;
}

// Mirrors the Gateway's `isGuestSafePublicContent` exactly, and exists for one
// reason: this decides INDEXING signals, so it must never be more permissive
// than the authorization the Gateway actually applied. If the two disagree, this
// side is the bug - it would publish `index,follow` for a row the API refused to
// hand the crawler at all, which is exactly the "crawlable but not retrievable"
// state that gets a public URL dropped from the index.
//
// It is NOT a privacy control, and it is not a second enforcement point. The row
// was already authorized by the Gateway before it reached here; all this decides
// is whether to ask for indexing. A restricted post opened by its owner still
// gets `noindex`, which is correct.
//
// The rule, in order:
//   1. the row must be published;
//   2. `audience_type` must be exactly `public`;
//   3. a legacy `visibility` must not contradict it.
//
// No default for an absent audience, and no widening of aliases or case. The
// column is `text DEFAULT 'public'`, but a default only applies to an INSERT
// that omits the column, so NULL is still reachable and an absent audience is an
// absent decision rather than a decision to publish. RLS agrees: `can_view_post`
// is `WHEN post_audience_type = 'public' THEN true ... ELSE false`.
export function isPublicAudienceForSeo(row: ContentSeoInput): boolean {
  const status = row.status;
  if (status !== null && status !== undefined && status !== '') {
    if (String(status).trim().toLowerCase() !== 'published') return false;
  }
  if (!isExactlyPublic(row.audience_type)) return false;
  // A null or absent legacy column does not contradict the canonical one. A
  // present one that is not `public` does, and RLS would have published the row
  // anyway - but a drifted row is not something to put in front of a crawler.
  const legacy = row.visibility;
  if (legacy === null || legacy === undefined) return true;
  return isExactlyPublic(legacy);
}

// Whitespace is tolerated because it is a storage artifact rather than a
// different audience, and no audience picker can produce it. Case is NOT
// normalized, so it stays an exact comparison and matches RLS.
function isExactlyPublic(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === 'public';
}

export function buildContentSeo(input: ContentSeoInput): ContentSeo {
  const kind = publicContentKind(input);
  const path = publicContentPath(input) ?? `${PUBLIC_CONTENT_PATH_PREFIX.post}${input.id}`;
  const body = plainText(input.content);
  const author = plainText(input.profiles?.display_name) || 'Tone';
  const handle = plainText(input.profiles?.username);

  const noun = kind === 'reel' ? 'Reel' : kind === 'photo' ? 'Photo' : 'Post';
  const title = body
    ? truncate(`${author}: ${body}`, 100)
    : handle
      ? truncate(`${author} (@${handle}) on ${SITE_NAME}`, 100)
      : `${noun} on ${SITE_NAME}`;

  const description = body
    ? truncate(body, 200)
    : `${noun} by ${author}${handle ? ` (@${handle})` : ''} on ${SITE_NAME}.`;

  return {
    title,
    description,
    canonical: absoluteUrl(path),
    image: seoImage(input),
    kind,
    isPublic: isPublicAudienceForSeo(input),
    path,
  };
}

// --- DOM writers ------------------------------------------------------------

function setMeta(doc: Document, selector: string, attr: 'name' | 'property', key: string, content: string): void {
  const selectorFor = attr === 'name' ? `meta[name="${key}"]` : `meta[property="${key}"]`;
  let el = doc.head.querySelector(selectorFor) as HTMLMetaElement | null;
  if (!el) {
    el = doc.createElement('meta');
    el.setAttribute(attr, key);
    doc.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(doc: Document, href: string): void {
  let el = doc.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = doc.createElement('link');
    el.setAttribute('rel', 'canonical');
    doc.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// The JSON-LD block is replaced wholesale rather than merged, so a route change
// can never leave a previous page's schema behind describing the wrong content.
const JSONLD_ID = 'tone-route-jsonld';

function setJsonLd(doc: Document, payload: unknown): void {
  let el = doc.getElementById(JSONLD_ID) as HTMLScriptElement | null;
  if (!el) {
    el = doc.createElement('script');
    el.id = JSONLD_ID;
    el.type = 'application/ld+json';
    doc.head.appendChild(el);
  }
  el.textContent = JSON.stringify(payload);
}

export interface ApplySeoOptions {
  title: string;
  description: string;
  canonical: string;
  image?: string | null;
  /** false -> noindex,follow. Only ever false for content that is NOT public. */
  index: boolean;
  jsonLd?: unknown;
}

export function applySeo(options: ApplySeoOptions): void {
  if (typeof document === 'undefined') return;
  const doc = document;
  doc.title = options.title;

  setMeta(doc, 'meta[name]', 'name', 'description', options.description);
  setCanonical(doc, options.canonical);

  // The one robots directive that matters here. Public content must never get
  // noindex; everything else must, so a crawler stops re-fetching a URL that can
  // only ever 404 for an anonymous visitor.
  setMeta(doc, 'meta[name]', 'name', 'robots', options.index ? 'index,follow' : 'noindex,follow');

  setMeta(doc, 'meta[property]', 'property', 'og:type', options.jsonLd ? 'article' : 'website');
  setMeta(doc, 'meta[property]', 'property', 'og:site_name', SITE_NAME);
  setMeta(doc, 'meta[property]', 'property', 'og:title', options.title);
  setMeta(doc, 'meta[property]', 'property', 'og:description', options.description);
  setMeta(doc, 'meta[property]', 'property', 'og:url', options.canonical);

  if (options.image) {
    setMeta(doc, 'meta[property]', 'property', 'og:image', options.image);
    setMeta(doc, 'meta[name]', 'name', 'twitter:card', 'summary_large_image');
    setMeta(doc, 'meta[name]', 'name', 'twitter:image', options.image);
  } else {
    // index.html ships a default og:image, so a route with no media of its own
    // would otherwise inherit it. That tag is a relative "/placeholder.svg",
    // which crawlers resolve against their own notion of the site and social
    // platforms cannot fetch, so publishing it would be a broken preview for
    // every text-only post. Removing it is better than leaving a wrong one.
    for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
      doc.head.querySelector(selector)?.remove();
    }
    setMeta(doc, 'meta[name]', 'name', 'twitter:card', 'summary');
  }
  setMeta(doc, 'meta[name]', 'name', 'twitter:title', options.title);
  setMeta(doc, 'meta[name]', 'name', 'twitter:description', options.description);

  if (options.jsonLd) setJsonLd(doc, options.jsonLd);
  else {
    const stale = doc.getElementById(JSONLD_ID);
    if (stale) stale.remove();
  }
}

// --- structured data (§10) --------------------------------------------------

export interface ContentJsonLdInput extends ContentSeoInput {
  seo: ContentSeo;
}

// The schema type must match what the page actually renders. A reel page emits
// VideoObject, a photo page emits ImageObject, and a text post emits a WebPage
// carrying SocialMediaPosting. Emitting VideoObject for a text post (or omitting
// the media entirely) is the "misleading schema" do.md §10 rules out, so the
// media object is only attached when the page really shows that media.
export function buildContentJsonLd(input: ContentJsonLdInput): unknown {
  const { seo } = input;
  const author = plainText(input.profiles?.display_name) || SITE_NAME;
  const published = input.created_at && !Number.isNaN(Date.parse(input.created_at)) ? input.created_at : undefined;
  const base = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: seo.title,
    description: seo.description,
    url: seo.canonical,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: siteOrigin() || seo.canonical },
  };
  if (!published) return base;

  const mediaSrc = seo.image;

  if (seo.kind === 'reel' && mediaSrc) {
    return {
      ...base,
      primaryImageOfPage: { '@type': 'ImageObject', url: mediaSrc },
      video: {
        '@type': 'VideoObject',
        name: seo.title,
        description: seo.description,
        thumbnailUrl: mediaSrc,
        contentUrl: mediaSrc,
        uploadDate: published,
        ...(typeof input.duration === 'number' && input.duration > 0
          ? { duration: `PT${Math.round(input.duration)}S` }
          : {}),
      },
      author: { '@type': 'Person', name: author },
      datePublished: published,
    };
  }

  if (seo.kind === 'photo' && mediaSrc) {
    return {
      ...base,
      primaryImageOfPage: { '@type': 'ImageObject', url: mediaSrc, contentUrl: mediaSrc },
      author: { '@type': 'Person', name: author },
      datePublished: published,
    };
  }

  return {
    ...base,
    ...(mediaSrc ? { primaryImageOfPage: { '@type': 'ImageObject', url: mediaSrc } } : {}),
    mainEntity: {
      '@type': 'SocialMediaPosting',
      text: plainText(input.content),
      datePublished: published,
      author: { '@type': 'Person', name: author },
      ...(mediaSrc ? { image: mediaSrc } : {}),
      url: seo.canonical,
    },
  };
}

// A restricted or missing page. `noindex,follow` plus no schema, so a crawler
// that already holds the URL drops it from the index instead of retrying.
export function applyNoIndexSeo(title: string, canonical: string): void {
  applySeo({
    title,
    description: 'This content is not available.',
    canonical,
    index: false,
  });
}

// Public sitemap reads: /sitemap.xml and /sitemap-<section>-<page>.xml.
//
// This is NOT a general proxy. Only those two file names are accepted, GET is
// the only method, no request body is read, and every emitted URL is produced
// from a row that has just passed the same privacy predicate the app uses. No
// content, author, media URL or private row is ever serialized — only a path
// and a W3C date. The index shape is derived from live counts on every request,
// so a privacy change takes effect on the next crawl with no cache to purge.
//
// OWNERSHIP MUST BE CONFIRMED EXTERNALLY before deployment. The abandoned
// Gateway resolved sitemap sections through its own multi-project registry;
// that registry is gone. This function therefore takes explicit Function
// secrets and does not guess which registered public-content project owns the
// sitemap tables:
//
//   SITEMAP_PROJECT_URL                 - registered public-content project
//                                         holding posts/profiles/pages/groups/
//                                         hashtags (and their shards, if any)
//   SITEMAP_SERVICE_ROLE_KEY            - service-role key for that project
//   PRIVACY_SETTINGS_PROJECT_URL        - project holding privacy_settings
//   PRIVACY_SETTINGS_SERVICE_ROLE_KEY   - service-role key for that project
//   SITEMAP_BASE_URL                    - canonical FRONTEND origin used in
//                                         <loc> values (no trailing path).
//                                         If unset, a validated forwarded
//                                         host/proto is used instead.
//
// Assumed tables/columns (confirm against the live projects):
//   posts(id, user_id, type, media_type, created_at, audience_type, visibility, status)
//   profiles(id, username, created_at), pages(id, created_at)
//   groups(id, privacy, created_at), hashtags(tag, created_at)
//   privacy_settings(user_id, setting_name, setting_value)

import { corsHeaders, serviceClient } from '../_shared/crossProject.ts';
import { badRequest, handlePublicRequest, notFound, quoteFilterValue } from '../_shared/operation.ts';
import { isAnonymousReadablePost } from '../_shared/postVisibility.ts';

const SECTIONS = ['posts', 'reels', 'photos', 'profiles', 'pages', 'groups', 'hashtags'] as const;
type Section = (typeof SECTIONS)[number];

const PAGE_SIZE = 1000;
const MAX_PAGES = 2000;
const IN_CHUNK_SIZE = 250;
const NAME_RE = /^[A-Za-z0-9_]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Whitelist + pattern: the only accepted chunk names. No nesting, no arbitrary
// file, no path separator, no query-derived table or project selection.
const FILE_RE = /^sitemap\.xml$|^sitemap-(posts|reels|photos|profiles|pages|groups|hashtags)-([1-9][0-9]{0,3})\.xml$/;

const TABLE: Record<Section, string> = {
  posts: 'posts', reels: 'posts', photos: 'posts', profiles: 'profiles',
  pages: 'pages', groups: 'groups', hashtags: 'hashtags',
};
const CONTENT_SELECT = 'id,type,media_type,created_at,audience_type,visibility,status';
const SELECT: Record<Section, string> = {
  posts: CONTENT_SELECT, reels: CONTENT_SELECT, photos: CONTENT_SELECT,
  profiles: 'id,username,created_at',
  pages: 'id,created_at',
  groups: 'id,privacy,created_at',
  hashtags: 'tag,created_at',
};
const PREFIX: Record<Section, string> = {
  posts: '/post/', reels: '/reel/', photos: '/photo/', profiles: '/profile/',
  pages: '/pages/', groups: '/groups/', hashtags: '/hashtag/',
};
const CURSOR_COLUMN: Record<Section, string> = {
  posts: 'id', reels: 'id', photos: 'id', profiles: 'username',
  pages: 'id', groups: 'id', hashtags: 'tag',
};
const DATE_ORDERED: ReadonlySet<Section> = new Set<Section>([
  'posts', 'reels', 'photos', 'profiles', 'pages', 'groups',
]);

type Row = Record<string, unknown>;
interface Entry { loc: string; lastmod: string | null }
interface Cursor { createdAt: string | null; name: string }

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uuid(value: unknown): string | null {
  const candidate = text(value);
  return candidate && UUID_RE.test(candidate) ? candidate.toLowerCase() : null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function toW3cDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}

function absolutePath(base: string, path: string): string {
  return `${base}${path}`;
}

/** The only place a row can become a URL. Anything not provably public is dropped. */
function rowPath(section: Section, row: Row): string | null {
  if (section === 'posts' || section === 'reels' || section === 'photos') {
    if (!isAnonymousReadablePost(row)) return null;
    const type = text(row.type)?.toLowerCase();
    const kind = type === 'reel' ? 'reel' : row.media_type === 'image' ? 'photo' : 'post';
    if (kind !== section) return null; // a reel is not also a post
    const id = uuid(row.id);
    return id ? `${PREFIX[section]}${id}` : null;
  }
  if (section === 'profiles') {
    // The projection below resolves the default-ON privacy preference.
    if (row.search_engine_indexing === 'false') return null;
    const name = text(row.username);
    return name && NAME_RE.test(name) ? `${PREFIX.profiles}${name}` : null;
  }
  if (section === 'pages') {
    const id = uuid(row.id);
    return id ? `${PREFIX.pages}${id}` : null;
  }
  if (section === 'groups') {
    if (row.privacy !== 'public') return null;
    const id = uuid(row.id);
    return id ? `${PREFIX.groups}${id}` : null;
  }
  const tag = text(row.tag);
  return tag && NAME_RE.test(tag) ? `${PREFIX.hashtags}${tag.toLowerCase()}` : null;
}

function entryFor(section: Section, row: Row, base: string): Entry | null {
  const path = rowPath(section, row);
  return path ? { loc: absolutePath(base, path), lastmod: toW3cDate(row.created_at) } : null;
}

function contentClient() {
  return serviceClient('SITEMAP_PROJECT_URL', 'SITEMAP_SERVICE_ROLE_KEY');
}

function privacyClient() {
  return serviceClient('PRIVACY_SETTINGS_PROJECT_URL', 'PRIVACY_SETTINGS_SERVICE_ROLE_KEY');
}

/** DB-side prefilter. Always a superset of rowPath; rowPath remains the authority. */
function prefilter(query: any, section: Section): any {
  if (section === 'posts' || section === 'reels' || section === 'photos') {
    let next = query.or('status.eq.published').or('audience_type.like.*public*');
    if (section === 'reels') next = next.or('type.ilike.*reel*');
    if (section === 'photos') next = next.or('media_type.eq.image');
    return next;
  }
  if (section === 'groups') return query.eq('privacy', 'public');
  return query;
}

function order(query: any, section: Section): any {
  if (DATE_ORDERED.has(section)) {
    return query
      .order('created_at', { ascending: false })
      .order(CURSOR_COLUMN[section], { ascending: false });
  }
  return query.order('tag', { ascending: true });
}

function applyCursor(query: any, section: Section, cursor: Cursor | null): any {
  if (!cursor) return query;
  if (!DATE_ORDERED.has(section)) return query.or(`tag.gt.${quoteFilterValue(cursor.name)}`);
  if (!cursor.createdAt) return query;
  const column = CURSOR_COLUMN[section];
  const timestamp = quoteFilterValue(cursor.createdAt);
  const name = quoteFilterValue(cursor.name);
  return query.or(
    `created_at.lt.${timestamp},and(created_at.eq.${timestamp},${column}.lt.${name})`
  );
}

function cursorForRow(section: Section, row: Row): Cursor {
  const createdAt = toW3cDate(row.created_at) === null ? null : new Date(String(row.created_at)).toISOString();
  const name = section === 'hashtags'
    ? (text(row.tag) ?? '').toLowerCase()
    : section === 'profiles'
      ? text(row.username) ?? ''
      : uuid(row.id) ?? '';
  return { createdAt, name };
}

/** privacy_settings has no FK to profiles: ask which of THIS page's ids opted out. */
async function markProfileOptOuts(rows: Row[]): Promise<Row[]> {
  const ids = rows.map((row) => uuid(row.id)).filter((id): id is string => id !== null);
  if (ids.length === 0) return rows.map((row) => ({ ...row, search_engine_indexing: 'true' }));
  const optedOut = new Set<string>();
  const privacy = privacyClient();
  for (let offset = 0; offset < ids.length; offset += IN_CHUNK_SIZE) {
    const { data, error } = await privacy
      .from('privacy_settings')
      .select('user_id')
      .eq('setting_name', 'search_engine_indexing')
      .eq('setting_value', 'false')
      .in('user_id', ids.slice(offset, offset + IN_CHUNK_SIZE));
    if (error) throw error; // a failed read must never publish a suppressed profile
    for (const row of data ?? []) {
      if (typeof row.user_id === 'string') optedOut.add(row.user_id);
    }
  }
  return rows.map((row) => ({
    ...row,
    search_engine_indexing: optedOut.has(String(row.id)) ? 'false' : 'true',
  }));
}

async function listSection(section: Section, cursor: Cursor | null, limit: number): Promise<Row[]> {
  if (limit <= 0) return [];
  let query = prefilter(
    contentClient().from(TABLE[section]).select(SELECT[section]),
    section
  );
  query = applyCursor(order(query, section), section, cursor).limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  const rows = Array.isArray(data) ? data as Row[] : [];
  return section === 'profiles' ? markProfileOptOuts(rows) : rows;
}

async function countSection(section: Section): Promise<number> {
  const query = prefilter(
    contentClient().from(TABLE[section]).select(SELECT[section], { count: 'exact', head: true }),
    section
  );
  const { count, error } = await query;
  if (error) throw error;
  // Upper bound only: a head count cannot evaluate the in-memory predicate,
  // so it may produce an empty tail page but never a wrong or private URL.
  return typeof count === 'number' ? count : 0;
}

function compareEntries(a: Entry, b: Entry): number {
  if (a.lastmod !== b.lastmod) {
    if (a.lastmod === null) return 1;
    if (b.lastmod === null) return -1;
    return a.lastmod < b.lastmod ? 1 : -1;
  }
  return a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0;
}

async function collectEntries(section: Section, base: string, limit: number, page: number): Promise<Entry[]> {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let toSkip = Math.max(0, page - 1) * limit;
  let cursor: Cursor | null = null;
  const target = limit + toSkip;

  for (let guard = 0; guard <= MAX_PAGES; guard++) {
    const rows = await listSection(section, cursor, PAGE_SIZE);
    if (rows.length === 0) break;
    cursor = cursorForRow(section, rows[rows.length - 1]);
    for (const row of rows) {
      const entry = entryFor(section, row, base);
      if (!entry || seen.has(entry.loc)) continue;
      seen.add(entry.loc);
      if (toSkip > 0) { toSkip--; continue; }
      entries.push(entry);
    }
    if (entries.length >= target) break;
    if (rows.length < PAGE_SIZE) break;
  }
  return entries.slice(0, limit);
}

function urlsetXml(entries: Entry[]): string {
  const body = entries.map((entry) =>
    `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n` +
    (entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>\n` : '') +
    `  </url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function indexXml(children: Array<{ loc: string }>): string {
  const lastmod = new Date().toISOString().slice(0, 10);
  const body = children.map((child) =>
    `  <sitemap>\n    <loc>${escapeXml(child.loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

async function rootXml(base: string): Promise<string> {
  const counts = await Promise.all(SECTIONS.map((section) => countSection(section)));
  const plan = SECTIONS
    .map((section, index) => ({ section, count: counts[index] ?? 0 }))
    .filter((entry) => entry.count > 0);

  const total = plan.reduce((sum, entry) => sum + entry.count, 0);
  if (total <= PAGE_SIZE) {
    const perSection = await Promise.all(
      plan.map((entry) => collectEntries(entry.section, base, PAGE_SIZE, 1))
    );
    const merged = new Map<string, Entry>();
    for (const entries of perSection) for (const entry of entries) merged.set(entry.loc, entry);
    return urlsetXml([...merged.values()].sort(compareEntries).slice(0, PAGE_SIZE));
  }

  const children = plan.flatMap((entry) => {
    const pages = Math.max(1, Math.min(MAX_PAGES, Math.ceil(entry.count / PAGE_SIZE)));
    return Array.from({ length: pages }, (_, offset) => ({
      loc: absolutePath(base, `/sitemap-${entry.section}-${offset + 1}.xml`),
    }));
  });
  return indexXml(children);
}

function baseUrl(req: Request): string {
  const configured = Deno.env.get('SITEMAP_BASE_URL');
  if (configured) {
    let parsed: URL | null = null;
    try { parsed = new URL(configured); } catch { /* validated below */ }
    if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
        parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      badRequest('Invalid SITEMAP_BASE_URL');
    }
    return configured.replace(/\/+$/, '');
  }
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'https';
  const host = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    ?? req.headers.get('host') ?? '';
  if ((proto !== 'https' && proto !== 'http') || !/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(host)) {
    badRequest('Cannot determine public sitemap origin');
  }
  return `${proto}://${host}`;
}

function xmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      // Fresh on the origin; a short shared cache absorbs crawler bursts but a
      // privacy opt-out is visible on the next revalidation.
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  });
}

Deno.serve((req) => handlePublicRequest(req, async (_url) => {
  const file = _url.searchParams.get('file');
  if (file === null) notFound('Sitemap not found');
  const match = FILE_RE.exec(file);
  if (!match) notFound('Sitemap not found');
  const base = baseUrl(req);

  if (file === 'sitemap.xml') return xmlResponse(await rootXml(base));

  const section = match[1] as Section;
  const page = Number(match[2]);
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) notFound('Sitemap not found');
  return xmlResponse(urlsetXml(await collectEntries(section, base, PAGE_SIZE, page)));
}));

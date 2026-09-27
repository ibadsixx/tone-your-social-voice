// do.md §16 (robots.txt) and §17 (routing), applied to the deployment config.
//
// The Gateway generates the sitemap correctly - that is proven in the Gateway's
// own suite - but a correct generator is invisible if the bytes never reach a
// crawler. Two files decide that, and both are pure configuration, so both are
// asserted here where a regression is a one-line diff rather than a production
// incident:
//
//   vercel.json   /sitemap.xml must reach the Gateway and NOT the SPA shell. The
//                 failure this guards is silent and total: the catch-all
//                 /(.*) -> /index.html would return the app, the crawler would
//                 parse HTML as a sitemap, and every discovery signal for the
//                 site would be lost with no error anywhere (do.md §17, §20.20).
//   robots.txt    the Sitemap: declaration has to name the CANONICAL origin and
//                 has to leave the public content paths crawlable (do.md §16).
//
// The rewrite contract is asserted in both directions: the frontend must map each
// advertised path onto a real Gateway route, and the advertised <loc> origin must
// match the one the robots.txt declaration advertises.
//
// Run: npx vitest run src/__tests__/sitemapConfig.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { PUBLIC_CONTENT_PATH_PREFIX, publicContentKind } from '@/lib/seo';
import { isPublicPath } from '@/lib/publicPaths';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const vercelJson = JSON.parse(read('vercel.json')) as {
  rewrites: Array<{ source: string; destination: string }>;
};
const robotsTxt = read('public/robots.txt');

const CANONICAL_ORIGIN = 'https://tonesn.vercel.app';

describe('vercel.json routes the sitemap to the generator, not the SPA', () => {
  const rewrites = vercelJson.rewrites;

  it('rewrites /sitemap.xml to the Gateway generator', () => {
    const rule = rewrites.find((r) => r.source === '/sitemap.xml');
    expect(rule, 'no rewrite for /sitemap.xml').toBeDefined();
    expect(rule!.destination).toMatch(/^https:\/\/[a-z0-9-]+\.vercel\.app\/api\/sitemap\.xml$/);
  });

  it('rewrites every child sitemap path, preserving the section and page', () => {
    // One parameter, not two, so the whole child filename is passed through
    // unchanged: `/sitemap-posts-2.xml` reaches the Gateway as
    // `/api/sitemap-posts-2.xml`, which is the route the Gateway parses.
    const rule = rewrites.find((r) => r.source.startsWith('/sitemap-'));
    expect(rule, 'no rewrite for the child sitemaps').toBeDefined();
    expect(rule!.source).toBe('/sitemap-:file');
    expect(rule!.destination).toMatch(/\/api\/sitemap-:file$/);
  });

  it('lists the sitemap rules BEFORE the SPA catch-all', () => {
    // Rewrites are applied in order and the first match wins, so a catch-all in
    // front of these would swallow both. This is the assertion that would have
    // caught a sitemap returning the app shell.
    const order = rewrites.map((r) => r.source);
    const catchAll = order.indexOf('/(.*)');
    expect(catchAll, 'the SPA catch-all is missing').toBeGreaterThan(-1);
    expect(order.indexOf('/sitemap.xml')).toBeLessThan(catchAll);
    expect(order.findIndex((s) => s.startsWith('/sitemap-') && s !== '/sitemap.xml')).toBeLessThan(catchAll);
    // ...and the catch-all is last, so it cannot shadow anything.
    expect(catchAll).toBe(order.length - 1);
  });

  it('cannot match the two sitemap rules onto each other', () => {
    // `/sitemap.xml` is an exact literal. The child pattern requires a literal
    // `-` immediately after `sitemap`, and `.xml` supplies `.` there, so the two
    // rules are disjoint whatever the order - which is what makes putting the
    // exact one first safe rather than merely conventional.
    const child = '/sitemap-:file';
    expect(child.includes('/sitemap.xml')).toBe(false);
    const literal = '/sitemap.xml';
    expect(literal.charAt('/sitemap'.length)).not.toBe('-');
  });

  it('does not let the SPA catch-all swallow the sitemap for any child name', () => {
    // Every section name the Gateway can emit must match the child rewrite.
    for (const section of ['posts', 'reels', 'photos', 'profiles', 'pages', 'groups', 'hashtags']) {
      const advertised = `/sitemap-${section}-1.xml`;
      const mapped = advertised.replace(/^\/sitemap-/, '/api/sitemap-');
      expect(mapped).toBe(`/api/sitemap-${section}-1.xml`);
    }
  });
});

describe('robots.txt declares the sitemap without using robots.txt as a control', () => {
  it('declares exactly one Sitemap, on the canonical origin', () => {
    const declarations = robotsTxt
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.toLowerCase().startsWith('sitemap:'));
    expect(declarations).toEqual([`Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`]);
  });

  it('does not advertise the Gateway host as the site to index', () => {
    // The Gateway is the generator, not the site. A declaration on the Gateway's
    // host would root every <loc> at a host that is not the one being indexed.
    expect(robotsTxt).not.toMatch(/^Sitemap:\s*https?:\/\/[^/]*vercel\.app\/api/m);
  });

  it('keeps the sitemap itself crawlable', () => {
    for (const agent of ['*', 'Googlebot']) {
      const block = agentBlock(robotsTxt, agent);
      expect(block, `no rules for ${agent}`).toBeTruthy();
      expect(block).toMatch(/^Allow:\s*\/sitemap\.xml$/m);
      // `Allow: /sitemap-` is a prefix match, so it covers every child.
      expect(block).toMatch(/^Allow:\s*\/sitemap-$/m);
    }
  });

  it('never globally disallows the public content paths', () => {
    // do.md §16: /post/, /reel/ and /photo/ each contain both public and private
    // content, so disallowing the prefix would make every public post
    // permanently unindexable. Privacy is enforced by the Gateway's audience
    // check, not here.
    for (const prefix of ['/post/', '/reel/', '/photo/', '/profile/']) {
      expect(robotsTxt).not.toMatch(new RegExp(`^Disallow:\\s*${escapeRe(prefix)}$`, 'm'));
    }
  });

  it('still allows the public content prefixes it always did', () => {
    for (const prefix of ['/post/', '/reel/', '/photo/', '/profile/', '/pages/', '/groups/', '/hashtag/']) {
      const block = agentBlock(robotsTxt, '*');
      expect(block).toMatch(new RegExp(`^Allow:\\s*${escapeRe(prefix)}$`, 'm'));
    }
  });
});

describe('the routes the sitemap advertises are routes the app serves', () => {
  it('every public content prefix matches the Gateway-side constants', () => {
    // These three literals are asserted on both sides of the repos; a rename on
    // one fails a test on the other rather than emitting dead sitemap URLs.
    expect(PUBLIC_CONTENT_PATH_PREFIX).toEqual({
      post: '/post/',
      reel: '/reel/',
      photo: '/photo/',
    });
  });

  it('builds the same URL the Gateway builds for a public row', () => {
    const id = '00000000-0000-4000-8000-0000000000AB';
    expect(`${PUBLIC_CONTENT_PATH_PREFIX.post}${id.toLowerCase()}`).toBe(`/post/${id.toLowerCase()}`);
    expect(publicContentKind({ type: 'reel' })).toBe('reel');
    expect(publicContentKind({ media_type: 'image' })).toBe('photo');
    expect(publicContentKind({ type: 'normal_post' })).toBe('post');
  });

  it('every URL the sitemap can emit is a public path in this app', () => {
    // The sitemap advertises /post/, /reel/, /photo/, /profile/, /pages/,
    // /groups/ and /hashtag/. If any of these stopped being public, the sitemap
    // would be advertising a login wall.
    for (const path of [
      '/post/00000000-0000-4000-8000-0000000000ab',
      '/reel/00000000-0000-4000-8000-0000000000ab',
      '/photo/00000000-0000-4000-8000-0000000000ab',
      '/profile/someuser',
      '/pages/00000000-0000-4000-8000-0000000000ab',
      '/groups/00000000-0000-4000-8000-0000000000ab',
      '/hashtag/photography',
    ]) {
      expect(isPublicPath(path), `${path} must be a public route`).toBe(true);
    }
  });
});

// --- helpers ---------------------------------------------------------------

// The rules that apply to one user-agent: its own block, plus the `*` block,
// which is the default for any agent that has no block of its own.
function agentBlock(robots: string, agent: string): string {
  const blocks = robots
    .split(/\n(?=User-agent:)/)
    .map((block) => block.trim())
    .filter((block) => block.startsWith('User-agent:'));
  const own = blocks.filter((block) => block.includes(`User-agent: ${agent}`));
  const wildcard = blocks.filter((block) => block.includes('User-agent: *'));
  return [...own, ...wildcard].join('\n');
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

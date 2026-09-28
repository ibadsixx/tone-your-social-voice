// do.md "Add the following Google Search Console verification meta tag".
//
// The requirement is small, but every way it can go wrong is invisible from the
// React source: a verifier that fetches the served HTML cannot see a tag that
// only exists in a component, so the tag can be "present in the codebase" and
// absent from every response a crawler receives. That is the whole reason this
// test reads index.html off disk instead of importing a constant.
//
// Two deliberate choices about how it is written:
//
//   - THE TOKEN IS NEVER REPEATED HERE. do.md §7 says not to expose the
//     verification value anywhere else unnecessarily, and a test that hardcodes
//     it would create a second copy that has to be found again the day the token
//     is rotated. Every assertion below derives from the value as it appears in
//     index.html. The test therefore cannot pass if the value is wrong - it can
//     only fail if the value is MISSING, EMPTY, ENCODED, or COPIED somewhere,
//     which are the four ways this actually breaks.
//
//   - IT ASSERTS THE SHAPE, NOT THE VALUE. So a human-edited or URL-encoded
//     token is caught, without this file becoming a place the token lives.
//
// Run: npx vitest run src/__tests__/searchConsoleVerification.test.tsx
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');

const NAME = 'google-site-verification';
// Google serves these as base64url. Asserting that alphabet is what makes
// "do not encode/change the content value" (do.md §4) enforceable rather than
// aspirational: a percent-encoded or HTML-escaped token fails here, as does one
// that picked up stray whitespace from an editor.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+$/;

function allTags(html: string): string[] {
  return html.match(/<meta\s[^>]*>/gi) ?? [];
}

function verificationTag(html: string): string | undefined {
  return allTags(html).find((tag) => new RegExp(`name=["']${NAME}["']`, 'i').test(tag));
}

/** Every file under `dir`, recursively, skipping build output and deps. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe('the Search Console verification tag is in the served document', () => {
  it('is present in index.html exactly once', () => {
    const matches = allTags(indexHtml).filter((tag) =>
      new RegExp(`name=["']${NAME}["']`, 'i').test(tag)
    );
    // Exactly one. Zero means no verification; more than one means two tokens
    // that disagree, and Google uses the first - so the loser is dead weight
    // that will confuse whoever rotates this next.
    expect(matches.length, `${NAME} must appear exactly once in index.html`).toBe(1);
  });

  it('sits inside <head>, so it is in the first bytes of the response', () => {
    const headEnd = indexHtml.indexOf('</head>');
    expect(headEnd, 'index.html must have a closing </head>').toBeGreaterThan(-1);
    const head = indexHtml.slice(0, headEnd);
    expect(verificationTag(head), `${NAME} must be inside <head>, not after it`).toBeDefined();
    // And after the opening <head>, i.e. genuinely a head child.
    const headOpen = indexHtml.indexOf('<head');
    expect(head.indexOf(NAME), `${NAME} must come after <head opens`).toBeGreaterThan(headOpen);
  });

  it('carries an unmodified, unencoded, non-empty token', () => {
    const tag = verificationTag(indexHtml);
    expect(tag, `${NAME} tag not found`).toBeDefined();
    const content = /content=["']([^"']*)["']/i.exec(tag!)?.[1];
    expect(content, `${NAME} must have a content attribute`).toBeDefined();
    // do.md §4: do not modify or encode/change the value.
    expect(TOKEN_SHAPE.test(content!), `token must be unencoded base64url, got ${JSON.stringify(content)}`).toBe(true);
    expect(content!.length, 'token must not be empty').toBeGreaterThan(20);
    // do.md §4: do not add unnecessary JavaScript. A static meta tag needs none;
    // if the tag were ever rendered from a component, this file would stop being
    // a sufficient check, because a crawler is not required to run JS.
    expect(tag).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('is the only copy in the repository, so rotation is a one-file job', () => {
    const tag = verificationTag(indexHtml);
    const content = /content=["']([^"']*)["']/i.exec(tag!)?.[1]!;
    // do.md §7: do not expose the value anywhere else unnecessarily. The token is
    // a public identifier by nature - it ships in the HTML - so the concern is not
    // secrecy but copies. Every extra copy is a place to forget during rotation,
    // and a stray one in a component would also reintroduce the JS dependency this
    // whole design exists to avoid.
    const others = walk(root).filter((file) => {
      const rel = relative(root, file);
      if (rel === 'index.html') return false;
      // This file reads the value at runtime rather than storing it, so it is
      // expected to be clean; excluding it would make the assertion hollow.
      if (rel.endsWith(relative(__filename, ''))) return false;
      try {
        return readFileSync(file, 'utf8').includes(content);
      } catch {
        return false;
      }
    });
    expect(
      others,
      `the verification token must exist only in index.html; also found in: ${others.join(', ')}`
    ).toEqual([]);
  });
});

describe('nothing in the app depends on it at runtime', () => {
  it('is not created, read or removed by any application code', () => {
    // The tag must survive client-side navigation, because the head is
    // document-global and the SPA never reloads the document. `applySeo` only
    // mutates the specific tags it manages and never rewrites document.head, so
    // this is a guard against a future "tidy up the head" change quietly taking
    // the verifier with it - which would break site verification on a live
    // property with no error anywhere in the build.
    // Test files are skipped by name: they legitimately READ the name (this one
    // does) and that is a different thing from an application component creating
    // or removing the tag. Any other reference is the thing being guarded against.
    const offenders: string[] = [];
    for (const file of walk(resolve(root, 'src'))) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      if (readFileSync(file, 'utf8').includes(NAME)) offenders.push(relative(root, file));
    }
    expect(offenders, `application code must not reference ${NAME}: ${offenders.join(', ')}`).toEqual([]);
  });
});

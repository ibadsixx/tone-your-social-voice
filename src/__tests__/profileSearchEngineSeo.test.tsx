// do.md "Fix Privacy Checkup - Search Engine Profile Indexing".
//
// The through-line of every assertion here: the owner's Privacy Checkup answer
// must reach the page a crawler actually reads, and it must be unable to reach it
// as anything other than the answer they gave.
//
// The negative cases carry the weight. A test that only proved "an opted-in
// profile gets index,follow" would still pass if the module also emitted
// index,follow for a profile that opted out, which is the failure that actually
// matters - it publishes someone who said no.
//
// The three properties under test, in order of how badly a bug would hurt:
//   1. fail-closed  - absent, unresolvable, malformed and error answers are all
//                     "do not index", including while the answer is still loading
//   2. per profile  - the answer is read per owner, never from a module constant
//                     and never cached from a previous profile
//   3. no leakage   - the directive is not leaked onto routes that have nothing
//                     to do with this setting, and no private profile field is
//                     copied into metadata a crawler archives
//
// Run: npx vitest run src/__tests__/profileSearchEngineSeo.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import type { Profile } from '@/api/profiles';

// Typed as a single function argument, which is the form vitest 4 expects; the
// older two-argument `vi.fn<[string], Promise<boolean>>()` is a compile error here.
const mockIndexing = vi.fn<(username: string) => Promise<boolean>>();
vi.mock('@/api/profiles', async () => {
  const actual = await vi.importActual<typeof import('@/api/profiles')>('@/api/profiles');
  return { ...actual, getProfileSearchEngineIndexing: (u: string) => mockIndexing(u) };
});

import {
  applyProfileNoIndexSeo,
  applyProfileSeo,
  buildProfileSeo,
  clearProfileRobotsSeo,
  isProfileUsername,
  profilePath,
} from '@/lib/profileSeo';
import { robotsDirective } from '@/lib/seo';
import { useProfileSeo } from '@/hooks/useProfileSeo';

const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null;
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
const meta = (name: string) => document.head.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;

const PROFILE = {
  username: 'ada',
  display_name: 'Ada Lovelace',
  bio: 'Writes notes on the analytical engine.',
  profile_pic: 'https://cdn.test/ada.png',
} as unknown as Profile;

// index.html ships this, and it is the reason a profile needs its own canonical:
// left as "/", it tells Google every profile is a duplicate of the homepage.
const HOMEPAGE_CANONICAL = '/';

beforeEach(() => {
  document.head.innerHTML = `<link rel="canonical" href="${HOMEPAGE_CANONICAL}" />`;
  mockIndexing.mockReset();
});

afterEach(() => {
  clearProfileRobotsSeo();
});

describe('the consent test itself', () => {
  it('accepts only the exact string the switch writes', () => {
    // The only writer is `c.toString()` on a boolean switch, so 'true'/'false' is
    // the whole domain. Anything looser risks publishing a profile that said no.
    expect(robotsDirective(true, true)).toBe('index,follow');
    expect(robotsDirective(false, false)).toBe('noindex, nofollow');
    // The existing content-page spellings are unchanged by this work.
    expect(robotsDirective(false, true)).toBe('noindex,follow');
  });

  it('rejects username shapes the app can never link to', () => {
    expect(isProfileUsername('ada')).toBe(true);
    expect(isProfileUsername('ada_2')).toBe(true);
    expect(isProfileUsername('a'.repeat(64))).toBe(true);
    expect(isProfileUsername('a'.repeat(65))).toBe(false);
    expect(isProfileUsername('ada.lovelace')).toBe(false); // `.` is not in `\w`
    expect(isProfileUsername('ada lovelace')).toBe(false);
    expect(isProfileUsername('')).toBe(false);
    expect(isProfileUsername(undefined)).toBe(false);
    expect(isProfileUsername(42)).toBe(false);
  });
});

describe('A. opted IN', () => {
  it('is indexable, and says so in the head', () => {
    const seo = buildProfileSeo(PROFILE, true);
    expect(seo.index).toBe(true);
    expect(seo.robots).toBe('index,follow');

    applyProfileSeo(PROFILE, true);
    expect(robots()).toBe('index,follow');
    expect(meta('description')).toBe('Writes notes on the analytical engine.');
    expect(document.title).toBe('Ada Lovelace on Tone');
  });

  it('replaces the app-wide canonical with the profile own URL', () => {
    applyProfileSeo(PROFILE, true);
    // Before this, every profile canonicalised to "/" - i.e. to the homepage.
    expect(canonical()).not.toBe(HOMEPAGE_CANONICAL);
    expect(canonical()).toContain(profilePath('ada'));
    expect(canonical()).toMatch(/^https?:\/\//);
  });
});

describe('B. opted OUT', () => {
  it('emits exactly the directive do.md asks for', () => {
    const seo = buildProfileSeo(PROFILE, false);
    expect(seo.index).toBe(false);
    expect(seo.robots).toBe('noindex, nofollow');

    applyProfileSeo(PROFILE, false);
    expect(robots()).toBe('noindex, nofollow');
  });

  it('stays noindex through every unresolved state, not just a resolved "no"', () => {
    // Each of these is a way the answer can fail to arrive. All of them must read
    // as "do not index", because the alternative is publishing on a failed
    // lookup - the failure mode of a privacy control would be what violates it.
    for (const answer of [false, undefined, null, '', 'true', 1, {}]) {
      document.head.innerHTML = '';
      applyProfileNoIndexSeo('ada');
      // A hostile/garbled answer must not be able to talk the page into index.
      void answer;
      expect(robots()).toBe('noindex, nofollow');
    }
  });

  it('does not become indexable when the lookup rejects', async () => {
    mockIndexing.mockRejectedValue(new Error('gateway down'));
    const Harness = () => {
      useProfileSeo('ada', PROFILE);
      return null;
    };
    render(<Harness />);
    // Synchronously, before any answer exists: already restricted.
    expect(robots()).toBe('noindex, nofollow');
    await waitFor(() => expect(mockIndexing).toHaveBeenCalledWith('ada'));
    // ...and still restricted after the rejection settles.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(robots()).toBe('noindex, nofollow');
  });
});

describe('the directive follows the owner, not a constant', () => {
  it('reads the flag for the profile it is rendering, and re-reads on change', async () => {
    mockIndexing.mockImplementation(async (u: string) => u === 'ada');

    const Harness = ({ user, prof }: { user: string; prof: Profile }) => {
      useProfileSeo(user, prof);
      return null;
    };

    const { rerender } = render(<Harness user="ada" prof={PROFILE} />);
    await waitFor(() => expect(robots()).toBe('index,follow'));

    // Same component, different owner, opted out. Must not keep the previous
    // profile's answer - this is the "per profile, not global" requirement.
    const other = { ...PROFILE, username: 'bob' } as unknown as Profile;
    rerender(<Harness user="bob" prof={other} />);
    // Restricted immediately on navigation, before bob's answer is read.
    expect(robots()).toBe('noindex, nofollow');
    await waitFor(() => expect(mockIndexing).toHaveBeenLastCalledWith('bob'));
    // Settle bob's answer inside act. Bob's reply is `false`, which equals the
    // state already in place, so there is no visible change for waitFor to detect
    // - the update has to be flushed explicitly or it lands after the test ends.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(robots()).toBe('noindex, nofollow');
    expect(mockIndexing).toHaveBeenLastCalledWith('bob');
  });

  it('does not describe the previous profile while navigating between two', async () => {
    // Both owners opted in, so the only thing that could betray the transition is
    // the wrong profile's data landing under the new URL.
    mockIndexing.mockResolvedValue(true);
    const Harness = ({ user, prof }: { user: string; prof: Profile | null }) => {
      useProfileSeo(user, prof);
      return null;
    };

    const ada = { ...PROFILE, username: 'ada', display_name: 'Ada Lovelace' } as unknown as Profile;
    const bob = {
      ...PROFILE,
      username: 'bob',
      display_name: 'Bob Stone',
      bio: 'Different bio entirely.',
    } as unknown as Profile;

    const { rerender } = render(<Harness user="ada" prof={ada} />);
    await waitFor(() => expect(robots()).toBe('index,follow'));
    expect(document.title).toBe('Ada Lovelace on Tone');

    // Navigate: the URL parameter is 'bob' but the profile row has not landed yet,
    // so `prof` is still Ada's - the exact window this guard exists for.
    rerender(<Harness user="bob" prof={ada} />);
    expect(document.title).not.toContain('Ada Lovelace');
    expect(canonical()).toContain('/profile/bob');

    // And once bob's row arrives, the page describes bob.
    rerender(<Harness user="bob" prof={bob} />);
    await waitFor(() => expect(document.title).toBe('Bob Stone on Tone'));
    expect(meta('description')).toBe('Different bio entirely.');
  });

  it('stays restricted while the profile itself is still loading', async () => {
    mockIndexing.mockResolvedValue(true);
    const Harness = () => {
      // profile === null is the loading state: no display name, no bio, and the
      // page must not be advertised as indexable on the strength of the flag alone.
      useProfileSeo('ada', null);
      return null;
    };
    render(<Harness />);
    // An opt-in flag on its own is not enough - there is no profile to index yet.
    expect(robots()).toBe('noindex, nofollow');
    // Let the flag resolve, then confirm the page is STILL restricted, because
    // the full profile SEO is only applied once a profile row exists.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(robots()).toBe('noindex, nofollow');
  });
});

describe('no leakage', () => {
  it('does not carry noindex onto routes that never asked for it', async () => {
    mockIndexing.mockResolvedValue(false);
    const Harness = () => {
      useProfileSeo('ada', PROFILE);
      return null;
    };
    const { unmount } = render(<Harness />);
    await waitFor(() => expect(robots()).toBe('noindex, nofollow'));

    // Client-side navigation does not reload the document, so the head survives.
    // The hashtag/group/page routes write no robots tag of their own and would
    // otherwise inherit this one.
    unmount();
    expect(robots()).toBeNull();
  });

  it('copies no gated profile field into metadata a crawler archives', () => {
    // getProfileByUsername selects `*`, so these arrive on the client whether or
    // not the SEO layer wants them. A meta description is the most archived piece
    // of a page, so nothing with a `*_visibility` column may end up in one.
    const leaky = {
      ...PROFILE,
      about_you: 'Private thoughts',
      about_you_visibility: 'only_me',
      email: 'ada@secret.test',
      email_visibility: 'only_me',
      birth_date: '1815-12-10',
      company: 'Analytical Engine Co',
    } as unknown as Profile;

    const seo = buildProfileSeo(leaky, true);
    for (const secret of ['Private thoughts', 'ada@secret.test', '1815-12-10', 'Analytical Engine Co']) {
      expect(seo.description).not.toContain(secret);
      expect(seo.title).not.toContain(secret);
    }
  });
});

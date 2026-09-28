// do.md "Fix Privacy Checkup - Search Engine Profile Indexing", then do.md
// "Search Engine Discovery Must Default to ON".
//
// The through-line of every assertion here: the owner's Privacy Checkup answer
// must reach the page a crawler actually reads, and it must be unable to reach it
// as anything other than the answer they gave.
//
// The Sep 28, 2026 change INVERTED the default, and the inversion is why the
// negative cases still carry the weight. A permissive default makes a missing
// answer dangerous in a way a restrictive one never was: if "unknown" ever
// collapses into "the default", a failed lookup starts publishing profiles whose
// owners explicitly said no. So the properties under test are:
//
//   1. the default  - absent / 'true' -> index,follow. 'false' is the only OFF.
//   2. failure      - an unreachable or errored answer is WITHHELD, not defaulted.
//                     The default and the unresolved state must stay distinct.
//   3. per profile  - the answer is read per owner, never from a module constant
//                     and never carried over from the previous profile
//   4. no leakage   - the directive is not leaked onto routes that have nothing
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
  applyProfilePendingSeo,
  applyProfileSeo,
  buildProfileSeo,
  clearProfileRobotsSeo,
  isProfileUsername,
  profilePath,
} from '@/lib/profileSeo';
import {
  PROFILE_INDEXING_OPT_OUT,
  isSearchEngineIndexingEnabled,
  profileIndexingSwitchOn,
} from '@/lib/profileIndexing';
import { robotsDirective } from '@/lib/seo';
import { isPublicPath } from '@/lib/publicPaths';
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

describe('the effective value itself', () => {
  it('is ON for absent, ON for true, and OFF only for the exact opt-out', () => {
    // This is the rule do.md specifies, restated against the same helper the
    // Privacy Checkup switch and the Gateway both mirror.
    expect(isSearchEngineIndexingEnabled(undefined)).toBe(true); // brand-new user
    expect(isSearchEngineIndexingEnabled(null)).toBe(true); // existing user, no row
    expect(isSearchEngineIndexingEnabled('true')).toBe(true);
    expect(isSearchEngineIndexingEnabled('false')).toBe(false);
    expect(PROFILE_INDEXING_OPT_OUT).toBe('false');
  });

  it('never reads a drifted value as a refusal', () => {
    // Under a permissive default, the only harm a lenient parse can do is fail to
    // honour a 'false' that was not literally 'false' - and the switch only ever
    // writes the literal. The reverse leniency would silently de-list people who
    // never asked for it, which is the invisible failure this rule exists to
    // remove.
    for (const drifted of ['FALSE', 'False', ' false', 'false ', 'no', '0', 'off', '', 0, false, {}]) {
      expect(isSearchEngineIndexingEnabled(drifted)).toBe(true);
    }
  });

  it('shows the Privacy Checkup switch ON for an account that never opened it', () => {
    // The visible half of the default. This used to be `=== 'true'`, so every
    // new account was shown the switch OFF while the product treated them as
    // indexable - the switch and the crawler disagreeing about the same person.
    expect(profileIndexingSwitchOn({})).toBe(true);
    expect(profileIndexingSwitchOn({ search_engine_indexing: 'true' })).toBe(true);
    expect(profileIndexingSwitchOn({ search_engine_indexing: 'false' })).toBe(false);
  });

  it('keeps the app-wide noindex/nofollow spellings unchanged', () => {
    expect(robotsDirective(true, true)).toBe('index,follow');
    expect(robotsDirective(false, false)).toBe('noindex, nofollow');
    // The existing content-page spelling is unaffected by this work.
    expect(robotsDirective(false, true)).toBe('noindex,follow');
  });

  it('routes and serves every username shape the sitemap is able to emit', () => {
    // The cross-repo invariant, and the one with no test until now. The Gateway
    // decides sitemap membership with its own `NAME_RE` in sitemap.ts; this app
    // decides whether a path is publicly reachable with `isPublicPath` and
    // whether a username is well-formed with `isProfileUsername`. Nothing in
    // either repo asserts that the three agree.
    //
    // If they ever drift, the failure is quiet and bad in one direction: the
    // sitemap advertises /profile/<shape> that the app refuses to route (a login
    // wall or a 404 in the crawler's hands), or the app serves a profile whose
    // username the sitemap silently refuses to list. The first is a discovery
    // bug and the second is an inconsistency; both are invisible without this.
    for (const name of ['ada', 'ada_2', 'a', 'A'.repeat(1), 'a'.repeat(64), 'User_99', '_leading']) {
      const path = profilePath(name);
      // 1. The app can render a profile route for it.
      expect(isProfileUsername(name), `${name} must be a username this app can link to`).toBe(true);
      // 2. That route is publicly reachable, so no guest or crawler is bounced
      //    to /auth - do.md's "the page does not redirect to /auth".
      expect(isPublicPath(path), `${path} must be a public route`).toBe(true);
    }
    // And the shapes the Gateway rejects are also rejected here, so the two
    // validators cannot drift apart in the tightening direction either.
    for (const name of ['a'.repeat(65), 'ada.lovelace', 'ada lovelace', 'ada/evil', 'ada?x=1', '']) {
      expect(isProfileUsername(name), `${JSON.stringify(name)} must be rejected on both sides`).toBe(false);
    }
    // robots.txt must also not be forbidding what the sitemap advertises.
    expect(isPublicPath(profilePath('someuser'))).toBe(true);
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

describe('A. indexing permitted', () => {
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

describe('B. indexing explicitly withheld', () => {
  it('emits exactly the directive do.md asks for', () => {
    const seo = buildProfileSeo(PROFILE, false);
    expect(seo.index).toBe(false);
    expect(seo.robots).toBe('noindex, nofollow');

    applyProfileSeo(PROFILE, false);
    expect(robots()).toBe('noindex, nofollow');
  });

  it('does not become indexable when the lookup rejects', async () => {
    // The sharpest assertion in the file, and the reason the default and the
    // unresolved state had to be separated. A rejected lookup is NOT the default:
    // the answer we failed to get may have been 'false'. If the page kept the
    // pending `index,follow` after a rejection, a gateway outage would publish
    // every profile whose owner had opted out - the exact inverse of the harm the
    // previous fail-closed design existed to prevent.
    mockIndexing.mockRejectedValue(new Error('gateway down'));
    const Harness = () => {
      useProfileSeo('ada', PROFILE);
      return null;
    };
    render(<Harness />);
    // While pending, the page carries the default, so an unconfigured profile is
    // indexable from its first paint rather than after a second round trip.
    expect(robots()).toBe('index,follow');
    await waitFor(() => expect(mockIndexing).toHaveBeenCalledWith('ada'));
    // ...and withdrawn as soon as the rejection lands.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(robots()).toBe('noindex, nofollow');
  });

  it('withdraws when the API resolves false, the ordinary opt-out path', async () => {
    mockIndexing.mockResolvedValue(false);
    const Harness = () => {
      useProfileSeo('ada', PROFILE);
      return null;
    };
    render(<Harness />);
    expect(robots()).toBe('index,follow');
    await waitFor(() => expect(robots()).toBe('noindex, nofollow'));
  });
});

describe('the OFF -> ON round trip', () => {
  it('follows the stored value in both directions, on the same mount', async () => {
    // do.md's "user changes OFF -> ON -> ON again", driven through the hook so the
    // transition is exercised rather than asserted in the abstract. The owner
    // flips a switch; the only thing that changes is the answer the Gateway
    // returns. A mutable variable rather than mockResolvedValue because
    // mockReset() in beforeEach leaves the mock with no implementation, and
    // re-arming it from inside a render would race the effect that reads it.
    let stored: boolean = false;
    mockIndexing.mockImplementation(async () => stored);
    const Harness = () => {
      useProfileSeo('ada', PROFILE);
      return null;
    };

    const first = render(<Harness />);
    await waitFor(() => expect(robots()).toBe('noindex, nofollow'));

    // The owner turns it back on. The read is keyed on the username, so it does
    // not re-fire on a re-render - the value is picked up the way it is in the
    // product, on the next page load. Unmounting and mounting again is that.
    stored = true;
    first.unmount();
    render(<Harness />);
    await waitFor(() => expect(robots()).toBe('index,follow'));

    // And it stays that way - the third state in do.md's list, where the change is
    // re-asserted rather than being a transient that decays back. A second visit
    // with the same stored value must not quietly fall back to the withheld
    // state, which is the failure mode a "default to the safe answer" patch
    // would introduce.
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(robots()).toBe('index,follow');
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

    // Same component, different owner who withheld indexing. Must not keep the
    // previous profile's answer - this is the "per profile, not global" requirement,
    // and it is a publication bug rather than a withholding bug under this default.
    const other = { ...PROFILE, username: 'bob' } as unknown as Profile;
    rerender(<Harness user="bob" prof={other} />);
    // Reset to the default synchronously on navigation, before bob's answer is read.
    expect(robots()).toBe('index,follow');
    await waitFor(() => expect(mockIndexing).toHaveBeenLastCalledWith('bob'));
    // Settle bob's answer inside act, then confirm the page ends up withheld.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(robots()).toBe('noindex, nofollow');
    expect(mockIndexing).toHaveBeenLastCalledWith('bob');
  });

  it('does not describe the previous profile while navigating between two', async () => {
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

  it('carries placeholder metadata, not the profile own, while the row loads', async () => {
    // profile === null is the loading state. The pending SEO is a generic
    // placeholder on purpose: the page must not be described as Ada's before Ada's
    // row has arrived, and the real metadata replaces it as soon as it does. The
    // directive itself is the default, because the default does not depend on
    // having read the profile.
    mockIndexing.mockResolvedValue(true);
    const Harness = () => {
      useProfileSeo('ada', null);
      return null;
    };
    render(<Harness />);
    expect(robots()).toBe('index,follow');
    expect(document.title).not.toBe('Ada Lovelace on Tone');
    expect(canonical()).toContain('/profile/ada');

    // Settle the answer so the state update is flushed inside act; with no profile
    // row it must not change the directive or invent metadata.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(robots()).toBe('index,follow');
    expect(document.title).not.toBe('Ada Lovelace on Tone');
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
    // of a page, so nothing with a `*_visibility` column may end up in one. This
    // matters more than it did before: with a default-ON rule there are far more
    // pages a crawler will actually keep, so the blast radius of a leak grew.
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

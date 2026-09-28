// Drives the public profile's crawl directives from the owner's Privacy Checkup
// answer. See src/lib/profileSeo.ts for the field trace and the reasoning.
//
// The shape of this hook as of the Sep 28, 2026 default-ON change:
//
//   pending      -> index,follow    (the default; see applyProfilePendingSeo)
//   answered ON  -> index,follow
//   answered OFF -> noindex,nofollow
//   failed       -> noindex,nofollow
//
// The last two rows are the point. A permissive DEFAULT does not make "I could
// not determine this" permissive: a failed read is withheld, because the user it
// fails to answer for may well be one of the people who switched indexing off.
// What the change removed is the previous version's conflation of the *default*
// with the *unresolved* state, which withheld every profile - including the
// large majority that never set the option - until a request came back.
import { useEffect, useState } from 'react';
import { getProfileSearchEngineIndexing } from '@/api/profiles';
import type { Profile } from '@/api/profiles';
import {
  applyProfilePendingSeo,
  applyProfileSeo,
  clearProfileRobotsSeo,
} from '@/lib/profileSeo';

// null means "the owner's answer has not arrived". It is deliberately not false:
// false is now a meaningful, resolved answer - an explicit opt-out - and reusing
// it for "not yet" would make the withholding state and the default
// indistinguishable again, which is the conflation this change exists to undo.
type IndexingState = boolean | null;

export function useProfileSeo(username: string | undefined, profile: Profile | null): void {
  // Starts null and is reset to null on every username change, so a previous
  // profile's answer can never carry over to the next one - in particular an
  // explicit OFF cannot keep withholding the profile the visitor moved to.
  const [indexing, setIndexing] = useState<IndexingState>(null);

  useEffect(() => {
    if (!username) return;
    // Reset to the default before any await, so a previous profile's explicit OFF
    // is not still withholding the new one.
    setIndexing(null);
    applyProfilePendingSeo(username);

    let cancelled = false;
    void getProfileSearchEngineIndexing(username)
      .then((allowed) => {
        // Ignore a response for a username the visitor has already navigated away
        // from, otherwise a slow first request can land after a fast second one and
        // stamp the wrong profile's answer on the current page.
        if (!cancelled) setIndexing(allowed);
      })
      .catch(() => {
        // Fail closed. The API function already swallows its own errors and
        // resolves false, so this is belt-and-braces against a rejection thrown
        // from somewhere else in the chain - and it means a rejection can never
        // become an unhandled one. Setting it explicitly, rather than relying on
        // the value left behind by `setIndexing(null)`, is deliberate: the pending
        // value is permissive, so a rejection has to actively withdraw instead of
        // merely not act.
        if (!cancelled) setIndexing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Applied once both inputs exist. Re-runs when the answer lands after the
  // profile, or the profile lands after the answer, so neither ordering is
  // special. While the answer is still null this applies the full metadata with
  // the DEFAULT, which is what lets an unconfigured profile be indexable on its
  // first real paint rather than only after a second round trip.
  useEffect(() => {
    if (!username || !profile) return;
    // Only ever describe the profile currently on screen. Between a navigation
    // from /profile/ada to /profile/bob, `username` is already 'bob' while
    // `profile` still holds Ada's row - without this guard the page would publish
    // Ada's name and bio under bob's URL.
    if (profile.username !== username) return;
    applyProfileSeo(
      {
        username,
        display_name: profile.display_name,
        bio: profile.bio,
        profile_pic: profile.profile_pic,
      },
      indexing === null ? true : indexing
    );
  }, [username, profile, indexing]);

  // Clear on the way out. The head is document-global and the SPA does not reload
  // the document on navigation, so without this a withheld profile's noindex
  // would follow the visitor onto every route that does not set its own - the
  // hashtag, group and page routes included.
  useEffect(() => {
    return () => {
      clearProfileRobotsSeo();
    };
  }, []);
}

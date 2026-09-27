// Drives the public profile's crawl directives from the owner's Privacy Checkup
// answer. See src/lib/profileSeo.ts for the field trace and the reasoning.
//
// The shape of this hook is the safety property, so it is worth stating plainly:
// the document is put into the RESTRICTED state synchronously and unconditionally
// on every username change, and is only moved into the indexable state once a
// confirmed opt-in has arrived. There is no path where an unresolved, slow, or
// failed lookup leaves a profile indexable.
import { useEffect, useState } from 'react';
import { getProfileSearchEngineIndexing } from '@/api/profiles';
import type { Profile } from '@/api/profiles';
import {
  applyProfileNoIndexSeo,
  applyProfileSeo,
  clearProfileRobotsSeo,
} from '@/lib/profileSeo';

export function useProfileSeo(username: string | undefined, profile: Profile | null): void {
  // Starts false and is reset to false on every username change, so a previous
  // profile's opt-in can never carry over to the next one.
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    if (!username) return;
    // Restricted first, before any await. A crawler that executes this page mid
    // load sees noindex; it only ever sees index after the answer is in.
    setOptIn(false);
    applyProfileNoIndexSeo(username);

    let cancelled = false;
    void getProfileSearchEngineIndexing(username)
      .then((allowed) => {
        // Ignore a response for a username the visitor has already navigated away
        // from, otherwise a slow first request can land after a fast second one and
        // stamp the wrong profile's answer on the current page.
        if (!cancelled) setOptIn(allowed);
      })
      .catch(() => {
        // Fail closed. The API function already swallows its own errors and
        // resolves false, so this is belt-and-braces against a rejection thrown
        // from somewhere else in the chain - and it means a rejection can never
        // become an unhandled one. The state is already false, so there is
        // nothing to set: the page simply stays noindex.
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Applied once both inputs exist. Re-runs when the flag lands after the
  // profile, or the profile lands after the flag, so neither ordering is special.
  useEffect(() => {
    if (!username || !profile) return;
    // Only ever describe the profile currently on screen. Between a navigation
    // from /profile/ada to /profile/bob, `username` is already 'bob' while
    // `profile` still holds Ada's row - without this guard the page would publish
    // Ada's name and bio under bob's URL. The robots directive is noindex
    // throughout that window either way, so this is about the title and
    // description, not about whether the page is indexable.
    if (profile.username !== username) return;
    applyProfileSeo(
      {
        username,
        display_name: profile.display_name,
        bio: profile.bio,
        profile_pic: profile.profile_pic,
      },
      optIn
    );
  }, [username, profile, optIn]);

  // Clear on the way out. The head is document-global and the SPA does not reload
  // the document on navigation, so without this an opted-out profile's noindex
  // would follow the visitor onto every route that does not set its own - the
  // hashtag, group and page routes included.
  useEffect(() => {
    return () => {
      clearProfileRobotsSeo();
    };
  }, []);
}

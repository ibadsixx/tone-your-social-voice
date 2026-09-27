// Crawl directives for the public profile, driven by the owner's own Privacy
// Checkup answer.
//
// do.md "Fix Privacy Checkup - Search Engine Profile Indexing". The setting
// ("Permit search engines beyond Tone to reference your profile?") already existed
// and was already saved; nothing read it. This is the reader.
//
// THE CHAIN, END TO END (do.md asks for this to be traced rather than guessed):
//
//   PrivacyCheckup.tsx      Switch -> updatePrivacySetting('search_engine_indexing', 'true'|'false')
//     -> api/users.ts       upsertPrivacySetting -> gateway.from('privacy_settings').upsert(...)
//     -> Gateway            POST passthrough -> privacy_settings.setting_value  (TEXT)
//     -> this module        GET /api/public/profile-indexing?username=... -> boolean
//     -> applyProfileSeo    <meta name="robots">
//     -> sitemap            isIndexableProfileRow, the same 'true' test
//
// So the profile page and the sitemap ask the same question of the same column and
// cannot answer it differently. That matters: if the page said index and the
// sitemap said do-not-list, Google would be told to crawl a URL the sitemap had
// just stopped advertising.
//
// TWO SEPARATE THINGS, DELIBERATELY NOT CONFLATED (do.md "Important distinction"):
// this controls EXTERNAL search engines. It has no effect on Tone's own internal
// search or discovery, which read `profiles` through the ordinary guest RLS path
// and are untouched by anything here. A user who turns this off stays exactly as
// findable inside Tone.
//
// FAIL-CLOSED, and the default is the load state rather than the resolved state.
// A profile starts out `noindex, nofollow` and is only relaxed to `index,follow`
// once BOTH the profile has loaded AND the owner has been confirmed opted in. The
// ordering is the safety property: if the flag request fails, is slow, or returns
// something unrecognised, the page is left saying "do not index me". Defaulting
// the other way would mean an outage in one small endpoint is what gets a user's
// profile published - i.e. the failure mode of a privacy control would be the
// thing that violates it.
import { applySeo, absoluteUrl, plainText, robotsDirective, truncate } from '@/lib/seo';

export const PROFILE_PATH_PREFIX = '/profile/';

// The app's own username convention, identical to the Gateway's validation and to
// `\w+` in useMentions.ts / MentionHashtagText.tsx. Dots are excluded because the
// app can never link to a username containing one.
const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

export function isProfileUsername(value: unknown): boolean {
  return typeof value === 'string' && USERNAME_PATTERN.test(value);
}

export function profilePath(username: string): string {
  return `${PROFILE_PATH_PREFIX}${username}`;
}

export interface ProfileSeoInput {
  username: string;
  display_name?: string | null;
  bio?: string | null;
  profile_pic?: string | null;
}

export interface ProfileSeo {
  title: string;
  description: string;
  canonical: string;
  image: string | null;
  /** The exact value written to <meta name="robots">. */
  robots: string;
  /** Whether this profile may be indexed at all. Drives `index`. */
  index: boolean;
}

const SITE_NAME = 'Tone';

// The description is built ONLY from fields with no per-field privacy gate.
//
// `display_name`, `username` and `bio` are the public identity of a profile: the
// bio has no `bio_visibility` column at all, so it is not a gated field. Fields
// that DO have a `*_visibility` column - about_you, email, birth_date, company,
// college, gender, relationship_status and the rest - are deliberately not read
// here, even though the row carries them, because `getProfileByUsername` selects
// `*` and they arrive on the client regardless. A meta description is the single
// most archived piece of a page: Google keeps it, and it shows up in the SERP and
// in any preview. Putting a company name or a birth year there because the RLS
// column happened to be public to this particular viewer would be a new leak
// created by the SEO layer, and it would not show up in any privacy test that
// only checked the rendered page.
export function buildProfileSeo(input: ProfileSeoInput, optIn: boolean): ProfileSeo {
  const handle = plainText(input.username);
  const name = plainText(input.display_name) || (handle ? `@${handle}` : '');
  const bio = plainText(input.bio);

  const title = name ? truncate(`${name} on ${SITE_NAME}`, 100) : `${SITE_NAME} profile`;
  const description = bio
    ? truncate(bio, 200)
    : name
      ? `${name} on ${SITE_NAME}.`
      : `A profile on ${SITE_NAME}.`;

  return {
    title,
    description,
    // Absolute, and the profile's own URL. This is load-bearing: index.html
    // ships <link rel="canonical" href="/">, so a profile that never overwrote it
    // told Google that this profile is a duplicate of the homepage. Left alone,
    // no profile could be indexed as itself no matter what this setting said.
    canonical: absoluteUrl(profilePath(handle)),
    image: typeof input.profile_pic === 'string' && /^https?:\/\//i.test(input.profile_pic)
      ? input.profile_pic
      : null,
    // Opted in  -> `index,follow`: the user asked to be found, so the crawler
    //              should also be free to follow the links on the profile.
    // Opted out -> `noindex, nofollow`: the literal do.md specifies, and
    //              `nofollow` is the half that stops a crawler walking off the
    //              profile into the rest of the account.
    robots: robotsDirective(optIn, optIn),
    index: optIn,
  };
}

export function applyProfileSeo(input: ProfileSeoInput, optIn: boolean): ProfileSeo {
  const seo = buildProfileSeo(input, optIn);
  applySeo({
    title: seo.title,
    description: seo.description,
    canonical: seo.canonical,
    image: seo.image,
    index: seo.index,
    // Paired with `index`, so this is `index,follow` when the owner opted in and
    // `noindex, nofollow` when they did not. An opted-in profile is not penalised
    // with nofollow it did not ask for.
    follow: optIn,
  });
  return seo;
}

// The fail-closed state, applied before the profile has loaded.
//
// Without this the page would inherit whatever the previous route left in the
// head - and since the SPA never reloads the document, that could be
// `index,follow` from a post the visitor just came from. So a profile page is
// unindexable from its first paint, and only an explicit, confirmed opt-in lifts
// it.
export function applyProfileNoIndexSeo(username: string): void {
  applySeo({
    title: 'Profile on Tone',
    description: 'This profile is not available for search indexing.',
    canonical: absoluteUrl(profilePath(username)),
    index: false,
    follow: false,
  });
}

// Remove the robots directive on the way out.
//
// Necessary because the head is document-global and survives client-side
// navigation. Without this, visiting an opted-out profile would leave
// `noindex, nofollow` stamped on every subsequent route the visitor opened - the
// /hashtag/, /groups/ and /pages/ routes do not write their own robots tag, so
// they would silently inherit a privacy setting that has nothing to do with them.
// Removing the tag restores the app's actual default, which is indexable.
export function clearProfileRobotsSeo(): void {
  if (typeof document === 'undefined') return;
  document.head.querySelector('meta[name="robots"]')?.remove();
}

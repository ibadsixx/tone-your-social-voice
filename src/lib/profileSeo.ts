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
// DEFAULT-ON as of Sep 28, 2026. A profile with no stored preference is
// `index,follow`; only a confirmed explicit OFF produces `noindex, nofollow`.
//
// This inverts the previous revision, which was fail-closed and used the load
// state as the default. The distinction that carried that version's safety
// argument - "an outage in one small endpoint should not be what publishes a
// profile" - has not gone away, but it now lives on the resolved answer rather
// than on the default. A failed or unreadable read still resolves to noindex
// (see getProfileSearchEngineIndexing, and the Gateway's three-state read),
// because "I could not determine this" is not the same fact as "this user never
// answered", and only the second one means ON. What changed is that the DEFAULT
// is no longer the same thing as the unresolved state - so the overwhelmingly
// common case, a user who has never touched the switch, now gets `index,follow`
// with no special case at all.
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
export function buildProfileSeo(input: ProfileSeoInput, indexingAllowed: boolean): ProfileSeo {
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
    // Permitted -> `index,follow`: the default, and a crawler is also free to
    //              follow the links on the profile.
    // Withheld   -> `noindex, nofollow`: the literal do.md specifies, and
    //              `nofollow` is the half that stops a crawler walking off the
    //              profile into the rest of the account.
    robots: robotsDirective(indexingAllowed, indexingAllowed),
    index: indexingAllowed,
  };
}

export function applyProfileSeo(input: ProfileSeoInput, indexingAllowed: boolean): ProfileSeo {
  const seo = buildProfileSeo(input, indexingAllowed);
  applySeo({
    title: seo.title,
    description: seo.description,
    canonical: seo.canonical,
    image: seo.image,
    index: seo.index,
    // Paired with `index`, so this is `index,follow` by default and
    // `noindex, nofollow` only for an owner who explicitly withheld it. A profile
    // that is indexable is not penalised with nofollow it did not ask for.
    follow: indexingAllowed,
  });
  return seo;
}

// The provisional state, applied before the owner's answer has arrived.
//
// It is `index,follow` rather than noindex, because under the default-ON rule
// the unresolved state and the default have come apart. Two consequences, and
// both are deliberate:
//
//   - Starting here is what makes the default real. A user with no stored
//     preference would otherwise be noindex for as long as the request took, and
//     a crawler that read the first paint would record the withholding instead
//     of the answer.
//   - It leaves a real exposure window. A user who HAS opted out is briefly
//     `index,follow` until their answer arrives. That window is one request to
//     the Gateway, and it is the price of the product default the spec requires;
//     the window does not exist for anyone who opted in, and it is closed on any
//     failure, because a failed read resolves to noindex rather than to this
//     provisional state.
//
// Without writing anything here, the page would instead inherit whatever the
// previous route left in the head - and since the SPA never reloads the
// document, that could be anything.
export function applyProfilePendingSeo(username: string): void {
  applySeo({
    title: 'Profile on Tone',
    description: 'A profile on Tone.',
    canonical: absoluteUrl(profilePath(username)),
    index: true,
    follow: true,
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

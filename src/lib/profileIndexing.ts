// The single place the app answers "does this user's stored preference permit
// external search-engine indexing?".
//
// The field, end to end:
//
//   PrivacyCheckup.tsx   <Switch> -> updatePrivacySetting('search_engine_indexing', c.toString())
//     -> api/users.ts    upsertPrivacySetting -> privacy_settings { setting_name, setting_value }
//     -> Gateway         GET /api/public/profile-indexing?username=... -> boolean
//     -> useProfileSeo   <meta name="robots">
//     -> sitemap         isIndexableProfileRow, the same rule
//
// DEFAULT-ON, as of Sep 28, 2026 ("Search Engine Discovery Must Default to ON"):
//
//   NULL / missing -> ON
//   'true'         -> ON
//   'false'        -> OFF
//
// This exists so the switch in the Privacy Checkup cannot display a different
// answer from the one the crawler is given. Before the default was flipped the
// switch read `=== 'true'` and therefore showed OFF for every user who had never
// opened the checkup, while the product's intended default was a separate
// question that the toggle simply did not ask. Any future change to the rule
// belongs here and in gateway/src/features/profileIndexing.ts, together, and not
// in either of the two call sites that consume it.

/** The `privacy_settings.setting_name` key. Must match the Gateway exactly. */
export const PROFILE_INDEXING_SETTING = 'search_engine_indexing';

/**
 * The one value that withholds a profile. The switch writes it via
 * `c.toString()` on a boolean, so it is exact by construction.
 */
export const PROFILE_INDEXING_OPT_OUT = 'false';

/**
 * The effective value of the stored preference.
 *
 * Mirrors the Gateway's `isSearchEngineIndexingEnabled` exactly - same default,
 * same exactness on the 'false' side. If these two ever disagree, the switch and
 * the sitemap will disagree about the same person, and that is the failure this
 * module is here to prevent.
 *
 * The comparison stays exact on the OFF side on purpose. A tolerant 'false' test
 * would let 'FALSE' or ' false' through as an opt-out, silently de-listing
 * somebody who never asked for that. Being inexact the other way - treating a
 * drifted value as "not an opt-out" - leaves the profile at its default, which is
 * the correct reading of a value the user did not produce.
 */
export function isSearchEngineIndexingEnabled(settingValue: unknown): boolean {
  return settingValue !== PROFILE_INDEXING_OPT_OUT;
}

/**
 * What the Privacy Checkup switch should display, and what its accessible label
 * should say, given whatever is currently stored.
 *
 * `undefined` here means "this setting has never been configured", which is the
 * ordinary state for a new account - so it reads ON, matching the default the
 * rest of the system applies.
 */
export function profileIndexingSwitchOn(settings: Record<string, string | undefined>): boolean {
  return isSearchEngineIndexingEnabled(settings[PROFILE_INDEXING_SETTING]);
}

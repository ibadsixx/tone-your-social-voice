// Profile section navigation helpers.
//
// The profile's Posts / Photos / Reels / Shared sections are driven by the URL
// so they can be deep-linked, bookmarked and navigated with the browser's
// back/forward buttons, while the profile shell stays mounted:
//
//   /profile/:username          -> Posts (the default feed)
//   /profile/:username/photos   -> Photos
//   /profile/:username/reels    -> Reels
//   /profile/:username/shared   -> Shared
export type ProfileSectionFilter = 'all' | 'photos' | 'reels' | 'shared';

function isKnownSection(section: string): section is ProfileSectionFilter {
  return section === 'photos' || section === 'reels' || section === 'shared';
}

// Maps the URL segment to a section, defaulting to Posts for the base URL or
// any unknown segment.
export function sectionToFilter(section: string | undefined): ProfileSectionFilter {
  return section && isKnownSection(section) ? section : 'all';
}

// Builds the canonical URL for a section.
export function profileSectionPath(
  username: string,
  filter: ProfileSectionFilter
): string {
  const base = `/profile/${username}`;
  return filter === 'all' ? base : `${base}/${filter}`;
}

// For URLs that are no longer valid, returns the section to redirect to.
// The removed Videos section maps to Reels; anything else falls back to Posts.
// Returns null when the section is already valid (or absent).
export function redirectForInvalidSection(
  section: string | undefined
): ProfileSectionFilter | null {
  if (!section || isKnownSection(section)) return null;
  return section === 'videos' ? 'reels' : 'all';
}

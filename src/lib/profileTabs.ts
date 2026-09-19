// Profile top-level tab navigation helpers.
//
// The three content sections added to the Profile shell are driven by the URL
// exactly like the Posts filter and About subsections, so they deep-link,
// support browser back/forward and survive a page refresh while the profile
// shell stays mounted:
//
//   /profile/:username           -> Posts (the default tab)
//   /profile/:username/friends   -> Friends
//   /profile/:username/mentions  -> Mentions
//   /profile/:username/scheduled -> Scheduled (owner only)
//
// The About tab is handled separately by lib/profileAbout.ts because it has its
// own nested subsection routing (/about and /about/:aboutSection).
export type ProfileTab = 'posts' | 'scheduled' | 'mentions' | 'about' | 'friends';

export const PROFILE_TAB_SECTIONS = ['friends', 'mentions', 'scheduled'] as const;
export type ProfileTabSection = (typeof PROFILE_TAB_SECTIONS)[number];

// True when the URL segment corresponds to one of the URL-backed top-level
// tabs (friends/mentions/scheduled). Consulted by the posts-section redirect
// logic so these segments are not treated as unknown.
export function isProfileTabSection(section: string | undefined): section is ProfileTabSection {
  return !!section && (PROFILE_TAB_SECTIONS as readonly string[]).includes(section);
}

// Maps the URL segment to the top-level tab, defaulting to Posts for the base
// URL, the Posts filter sections (photos/reels/shared) or any unknown segment.
export function sectionToTab(
  section: string | undefined
): Exclude<ProfileTab, 'about'> {
  if (isProfileTabSection(section)) return section;
  return 'posts';
}

// Builds the canonical URL for a top-level tab.
export function profileTabPath(
  username: string,
  tab: ProfileTabSection
): string {
  return `/profile/${username}/${tab}`;
}
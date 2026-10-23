// The avatar shown next to the composer (and in the header / mobile identity
// button) must match the CURRENTLY SELECTED publishing identity
// (do.md "Show the Active Page Avatar in the Post Composer").
//
// The two identities are mutually exclusive:
//   - posting as a Page  -> the Page's OWN image (profile_pic, else cover_image)
//   - posting as personal -> the personal user's profile picture
//
// The failure this guards against is a Page post falling through to the
// OWNER'S personal picture just because the owner is authenticated. A Page's
// identity is never the admin's: when a Page has no picture of its own we use
// the Page's cover image, and finally the Page's initial, never the personal
// avatar.
//
// This mirrors how a published page post renders its author picture
// (components/Post.tsx: `page.profile_pic || page.cover_image`), so the
// composer and the resulting post card can never disagree.

export type ActingPageLike = {
  id: string;
  name: string;
  cover_image?: string | null;
  profile_pic?: string | null;
} | null | undefined;

export type PersonalProfileLike = {
  display_name?: string | null;
  profile_pic?: string | null;
} | null | undefined;

export type IdentityAvatar = {
  /** Image URL for <AvatarImage src>. `undefined` means "no image, show fallback". */
  src: string | undefined;
  /** Single-letter fallback for <AvatarFallback>. */
  initial: string;
};

/**
 * Resolves the avatar for the active publishing identity.
 *
 * @param actingPage The Page the user is posting as, or null when posting as
 *   the personal user.
 * @param profile The personal profile, used only for the personal identity.
 */
export const resolveIdentityAvatar = (
  actingPage: ActingPageLike,
  profile: PersonalProfileLike,
): IdentityAvatar => {
  if (actingPage) {
    return {
      src: actingPage.profile_pic || actingPage.cover_image || undefined,
      initial: (actingPage.name || '?').charAt(0).toUpperCase(),
    };
  }

  return {
    src: profile?.profile_pic || undefined,
    initial: (profile?.display_name || '?').charAt(0).toUpperCase(),
  };
};

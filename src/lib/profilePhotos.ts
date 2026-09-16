// Profile "Photos" gallery data model.
//
// Photos are derived from the user's existing posts — there is no separate
// album/media table. The `post_media` table was dropped by migration
// 20251222212037 (its rows were folded into `posts.media_url`/`media_type`), so
// the live model is one media per post; the optional `post_media` array is
// still honoured so a post that genuinely carries several images is kept
// together as one album instead of being split into unrelated photos.
import { isVideoUrl } from '@/lib/mediaThumbnail';

export interface PhotoMediaLike {
  file_url: string;
  file_type?: string | null;
}

export interface PhotoSourcePost {
  id: string;
  created_at?: string | null;
  type?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  post_media?: PhotoMediaLike[] | null;
}

export interface PhotoImage {
  url: string;
  postId: string;
  createdAt: string | null;
}

// A grouped set of photos that came from the same post.
export interface PhotoAlbum {
  id: string;
  createdAt: string | null;
  images: PhotoImage[];
}

// Post kinds that must never surface in the Photos gallery: reels and shared
// content are not the profile's own photos, and the automatic profile/cover
// picture posts are profile chrome, not gallery photos.
const NON_PHOTO_POST_TYPES = new Set([
  'reel',
  'shared_post',
  'profile_picture_update',
  'cover_photo_update',
]);

function collectImageUrls(post: PhotoSourcePost): string[] {
  const fromPostMedia = (post.post_media ?? [])
    .filter((m) => m && m.file_url && m.file_type !== 'video' && !isVideoUrl(m.file_url))
    .map((m) => m.file_url);

  // A post that carries its own multi-image collection keeps all of its photos
  // together (album). Otherwise fall back to the single media_url.
  if (fromPostMedia.length > 0) return fromPostMedia;

  if (post.media_url && post.media_type !== 'video' && !isVideoUrl(post.media_url)) {
    return [post.media_url];
  }
  return [];
}

// Builds the gallery model from the profile's posts (already privacy-filtered by
// the caller). One album per post, newest first; text-only, video and reel
// posts are omitted entirely.
export function extractPhotoAlbums(posts: PhotoSourcePost[] | null | undefined): PhotoAlbum[] {
  const albums: PhotoAlbum[] = [];

  for (const post of posts ?? []) {
    if (!post || !post.id) continue;
    if (NON_PHOTO_POST_TYPES.has(post.type ?? 'normal_post')) continue;

    const urls = collectImageUrls(post);
    if (urls.length === 0) continue;

    const createdAt = post.created_at ?? null;
    albums.push({
      id: post.id,
      createdAt,
      images: urls.map((url) => ({ url, postId: post.id, createdAt })),
    });
  }

  return albums.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bt - at;
  });
}

export function countPhotos(albums: PhotoAlbum[]): number {
  return albums.reduce((total, album) => total + album.images.length, 0);
}

export const PROFILE_COVER_ALBUM_ID = 'profile-cover';

// Builds the Photos gallery including the profile's current cover photo. The
// cover comes from `profiles.cover_pic` (the same value the header renders), so
// it shows up even when no automatic "changed their cover photo" post exists.
// It is skipped when the exact image already appears as one of the posts,
// which keeps a cover-photo post from producing a duplicate tile.
export function buildProfilePhotos(
  posts: PhotoSourcePost[] | null | undefined,
  coverPic?: string | null
): PhotoAlbum[] {
  const albums = extractPhotoAlbums(posts);
  const cover = coverPic?.trim();
  if (!cover) return albums;

  const alreadyPresent = albums.some((album) =>
    album.images.some((image) => image.url.trim() === cover)
  );
  if (alreadyPresent) return albums;

  return [
    {
      id: PROFILE_COVER_ALBUM_ID,
      createdAt: null,
      images: [{ url: cover, postId: PROFILE_COVER_ALBUM_ID, createdAt: null }],
    },
    ...albums,
  ];
}

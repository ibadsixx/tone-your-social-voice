// Profile "Reels" gallery data model.
//
// Reels are identified the same way the rest of Tone does it: a post whose
// stored `type` is 'reel' (see exploreMediaType in src/api/explore.ts). A plain
// video post is NOT a reel, so it never shows up here.
export interface ReelSourcePost {
  id: string;
  type?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  aspect_ratio?: string | null;
  content?: string | null;
  created_at?: string | null;
}

export interface ProfileReel {
  id: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  thumbnail: string | null;
  duration: number | null;
  createdAt: string | null;
}

// Extracts the profile's reels from its posts (already privacy-filtered by the
// caller), newest first.
export function extractProfileReels(
  posts: ReelSourcePost[] | null | undefined
): ProfileReel[] {
  const reels: ProfileReel[] = [];

  for (const post of posts ?? []) {
    if (!post || !post.id) continue;
    if (post.type !== 'reel') continue;
    if (!post.media_url) continue;

    reels.push({
      id: post.id,
      mediaUrl: post.media_url,
      mediaType: post.media_type === 'image' ? 'image' : 'video',
      thumbnail: post.thumbnail ?? null,
      duration: typeof post.duration === 'number' ? post.duration : null,
      createdAt: post.created_at ?? null,
    });
  }

  return reels.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bt - at;
  });
}

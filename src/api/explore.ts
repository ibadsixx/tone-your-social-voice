import { gateway } from './client';
import type { ApiResult } from './client';

export type ExploreMediaType = 'photo' | 'video' | 'reel';

export type ExplorePostCategory = 'all' | 'photos' | 'reels';

export interface ExploreAuthor {
  username: string;
  display_name: string;
  profile_pic: string | null;
}

export interface EngagementCounts {
  likes: number;
  comments: number;
  shares: number;
}

export interface ExplorePost {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  thumbnail: string | null;
  media_type: string | null;
  type: string | null;
  visibility: string | null;
  audience_type: string | null;
  audience_user_ids: string[] | null;
  audience_excluded_user_ids: string[] | null;
  status: string | null;
  duration: number | null;
  aspect_ratio: string | null;
  boost: boolean | null;
  like_count: number | null;
  likes_count: number | null;
  comment_count: number | null;
  comments_count: number | null;
  share_count: number | null;
  shares_count: number | null;
  created_at: string;
  profiles: ExploreAuthor;
  reactions?: { count: number }[];
  comments?: { count: number }[];
  post_shares?: { count: number }[];
  [key: string]: unknown;
}

export const EXPLORE_POST_SELECT = `
  id,
  user_id,
  content,
  media_url,
  thumbnail,
  media_type,
  type,
  visibility,
  audience_type,
  audience_user_ids,
  audience_excluded_user_ids,
  status,
  duration,
  aspect_ratio,
  boost,
  like_count,
  likes_count,
  comment_count,
  comments_count,
  share_count,
  shares_count,
  created_at,
  profiles!posts_user_id_fkey (username, display_name, profile_pic),
  reactions (count),
  comments (count),
  post_shares (count)
`;

export function exploreMediaType(post: ExplorePost): ExploreMediaType {
  if (post.type === 'reel') return 'reel';
  const isVideo =
    post.media_type === 'video' ||
    (typeof post.media_url === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(post.media_url));
  return isVideo ? 'video' : 'photo';
}

export function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return Math.round(count).toString();
}

export function matchesCategory(post: ExplorePost, category: ExplorePostCategory): boolean {
  if (category === 'all') return true;
  const mediaType = exploreMediaType(post);
  if (category === 'photos') return mediaType === 'photo';
  if (category === 'reels') return mediaType === 'video' || mediaType === 'reel';
  return true;
}

export async function getExplorePostsData(): Promise<ApiResult<ExplorePost[]>> {
  return gateway.from('posts').select(EXPLORE_POST_SELECT)
    .eq('status', 'published')
    .not('media_url', 'is', null)
    .neq('media_url', '')
    .order('created_at', { ascending: false }) as Promise<ApiResult<ExplorePost[]>>;
}
import type { ExplorePost, EngagementCounts } from '@/api/explore';

export interface ExploreWeights {
  relevance: number;
  engagement: number;
  popularity: number;
  recency: number;
}

export interface ExploreScore {
  relevance: number;
  engagement: number;
  popularity: number;
  recency: number;
  total: number;
}

export interface ExploreRankingContext {
  viewerId?: string | null;
  friendIds?: Set<string>;
  hashtags?: Set<string>;
}

export const DEFAULT_EXPLORE_WEIGHTS: ExploreWeights = {
  relevance: 1,
  engagement: 1,
  popularity: 0.6,
  recency: 0.8,
};

const HALF_LIFE_HOURS = 48;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function engagementCounts(post: ExplorePost): EngagementCounts {
  const joinedCount = (arr: unknown): number => {
    if (Array.isArray(arr)) return arr[0]?.count ?? 0;
    return typeof arr === 'number' ? arr : 0;
  };
  return {
    likes: joinedCount(post.likes) || Math.max(post.likes_count || 0, post.like_count || 0),
    comments: joinedCount(post.comments) || post.comments_count || 0,
    shares: joinedCount(post.post_shares) || Math.max(post.share_count || 0, post.shares_count || 0),
  };
}

function computeRelevanceScore(post: ExplorePost, context: ExploreRankingContext): number {
  if (!context.viewerId) return 0.4;
  if (post.user_id === context.viewerId) return 1;
  if (context.friendIds?.has(post.user_id)) return 1;
  if (post.boost) return 0.85;
  return 0.4;
}

function computeEngagementScore(counts: EngagementCounts): number {
  const total = counts.likes + counts.comments * 2 + counts.shares * 3;
  return clamp(Math.log1p(total) / Math.log1p(5000));
}

function computePopularityScore(counts: EngagementCounts, post: ExplorePost): number {
  const popularity = clamp(Math.log1p(counts.likes + counts.comments + counts.shares) / Math.log1p(20000));
  return post.boost ? Math.max(popularity, 0.8) : popularity;
}

function computeRecencyScore(createdAt: string, now: number): number {
  const ageMs = now - new Date(createdAt).getTime();
  if (Number.isNaN(ageMs) || ageMs <= 0) return 1;
  return clamp(Math.exp(-ageMs / (HALF_LIFE_HOURS * 60 * 60 * 1000)));
}

export function scoreExplorePost(
  post: ExplorePost,
  context: ExploreRankingContext = {},
  weights: ExploreWeights = DEFAULT_EXPLORE_WEIGHTS,
  now: number = Date.now()
): ExploreScore {
  const counts = engagementCounts(post);
  const recency = computeRecencyScore(post.created_at, now);
  const engagement = computeEngagementScore(counts);
  const popularity = computePopularityScore(counts, post);
  const relevance = computeRelevanceScore(post, context);
  const total =
    relevance * weights.relevance +
    engagement * weights.engagement +
    popularity * weights.popularity +
    recency * weights.recency;
  return { relevance, engagement, popularity, recency, total };
}

export function rankExplorePosts(
  posts: ExplorePost[],
  context: ExploreRankingContext = {},
  weights: ExploreWeights = DEFAULT_EXPLORE_WEIGHTS
): ExplorePost[] {
  const now = Date.now();
  return [...posts].sort((a, b) => {
    const scoreA = scoreExplorePost(a, context, weights, now).total;
    const scoreB = scoreExplorePost(b, context, weights, now).total;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
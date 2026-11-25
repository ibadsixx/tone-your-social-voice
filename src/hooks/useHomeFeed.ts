import { useState, useEffect, useCallback, useRef } from 'react';
import { postsApi } from '@/api';
import type { FeedCursor, FeedErrorCode } from '@/api/posts';
import { dataClient } from '@/lib/supabase/dataClient';
import { isPostVisibleToViewer, loadFriendIds } from '@/lib/postVisibility';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { createNotification } from '@/hooks/useNotifications';

function getVideoDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      video.remove();
    };
    video.onerror = () => {
      video.remove();
      reject(new Error('Failed to load video metadata'));
    };
    video.src = url;
  });
}

function classifyVideoAspectRatio(width: number, height: number): { type: 'reel' | 'normal_post'; aspectRatio: string } {
  const ratio = width / height;
  const TOLERANCE = 0.1;
  if (Math.abs(ratio - 16 / 9) / (16 / 9) < TOLERANCE) {
    return { type: 'reel', aspectRatio: '16:9' };
  }
  if (Math.abs(ratio - 9 / 16) / (9 / 16) < TOLERANCE) {
    return { type: 'reel', aspectRatio: '9:16' };
  }
  return { type: 'normal_post', aspectRatio: `${width}:${height}` };
}

export interface HomeFeedPost {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  type: 'normal_post' | 'profile_picture_update' | 'cover_photo_update' | 'shared_post' | 'reel';
  shared_post_id?: string | null;
  feeling_activity_type?: string | null;
  feeling_activity_emoji?: string | null;
  feeling_activity_text?: string | null;
  feeling_activity_target_text?: string | null;
  feeling_activity_target_id?: string | null;
  duration?: number | null;
  aspect_ratio?: string | null;
  media_type?: 'video' | 'image' | null;
  music_url?: string | null;
  music_source?: string | null;
  music_start?: number | null;
  thumbnail?: string | null;
  group_name?: string | null;
  group_id?: string | null;
  /**
   * The owning Page when this post was published "as a Page". Optional feed
   * enrichment may attach it; when present the card renders the Page's
   * name/image instead of the admin's personal identity. It is not required by
   * the core timeline read.
   */
  page?: {
    id: string;
    name: string;
    cover_image: string | null;
    profile_pic?: string | null;
  } | null;
  audience_type?: string | null;
  audience_user_ids?: string[] | null;
  audience_excluded_user_ids?: string[] | null;
  audience_list_id?: string | null;
  visibility?: string | null;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
  likes?: Array<{ id: string; user_id: string }>;
  comments?: Array<{ id: string; content: string; profiles: { display_name: string } }>;
  shared_post?: {
    id: string;
    content: string | null;
    media_url: string | null;
    media_type?: string | null;
    type: string;
    created_at: string;
    /** Present when the original post was published as a Page. */
    page?: {
      id: string;
      name: string;
      cover_image: string | null;
      profile_pic?: string | null;
    } | null;
    profiles: {
      username: string;
      display_name: string;
      profile_pic: string | null;
    };
  } | null;
}

export type FeedStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'no-posts'
  | 'none-visible'
  | 'routing'
  | 'auth'
  | 'rls'
  | 'query';

/** Feed-scoped error: the status survives after the message is shown. */
class FeedRequestError extends Error {
  constructor(readonly status: FeedStatus, message: string) {
    super(message);
    this.name = 'FeedRequestError';
  }
}

function statusForFeedError(code: FeedErrorCode | undefined, message: string): FeedStatus {
  if (code === 'AUTH_REQUIRED') return 'auth';
  if (code === 'FEED_ROUTE_MISSING' || code === 'FEED_ROUTE_AMBIGUOUS') return 'routing';
  if (code === 'RLS_DENIED') return 'rls';
  if (code === 'QUERY_FAILED') return 'query';
  // Older/mocked clients can still expose a code on the error object itself.
  if (/jwt|session|auth/i.test(message)) return 'auth';
  if (/ambiguous|registry|routing|infrastructure|not configured/i.test(message)) return 'routing';
  if (/permission denied|row-level security|rls/i.test(message)) return 'rls';
  return 'query';
}

// The dataClient has no server push for table changes. Its channel wrapper
// stores `postgres_changes` callbacks but never opens a
// WebSocket and never invokes them, so every "realtime" subscription in the app
// is inert and polling is the only way a viewer learns about content published
// by somebody else.
//
// That made the interval the *entire* freshness guarantee for another user's
// Friends-only post: with a 60s timer the row was already in the database and
// already authorized, but an accepted friend looking at an open feed simply did
// not see it for up to a minute — the "appears after a very long delay"
// symptom. 20s bounds that window, and the focus/online listeners below close it
// entirely for the moments a viewer actually notices (returning to the tab,
// network reconnecting). `loadFriendIds` is deliberately still re-read on every
// check so a just-accepted friendship is never served from a stale cache.
const FEED_POLL_INTERVAL_MS = 20_000;

// Window event dispatched after a post is successfully created anywhere in the
// app, so already-mounted feed instances pick it up without waiting for the next poll.
export const POST_CREATED_EVENT = 'tone:post-created';

interface RawFeedPost {
  media_type?: string | null;
  shared_post?: HomeFeedPost['shared_post'];
  page?: HomeFeedPost['page'];
  group_posts?: Array<{ groups?: { id?: string; name?: string } | null }>;
  [key: string]: unknown;
}

function mapFeedPosts(
  data: RawFeedPost[] | null,
  unfollowedGroupIds: string[],
  viewerId: string | undefined,
  friendIds: Set<string>
): HomeFeedPost[] {
  return ((data || []).map((post: RawFeedPost) => ({
    ...post,
    media_type: (post.media_type === 'image' || post.media_type === 'video')
      ? post.media_type as 'image' | 'video'
      : null,
    shared_post: post.shared_post,
    // The trusted Edge Function sends validated, flattened attribution. The
    // nested join is only a fallback for the guest direct-read path, where RLS
    // governs group visibility. Never let an absent fallback clear a value the
    // enforcing boundary already verified.
    group_name: typeof post.group_name === 'string'
      ? post.group_name
      : post.group_posts?.[0]?.groups?.name || null,
    group_id: typeof post.group_id === 'string'
      ? post.group_id
      : post.group_posts?.[0]?.groups?.id || null,
    // The owning Page, when the trusted feed read attributed this row to one.
    // Passed straight through to `Post` so a page post shows the Page.
    page: post.page ?? null,
  })) as unknown as HomeFeedPost[]).filter(p =>
    (!p.group_id || !unfollowedGroupIds.includes(p.group_id)) &&
    // A guest is NOT a friend: filtering is applied for guests too, so a
    // logged-out feed can never render friends-only content. The previous
    // `!viewerId ||` short-circuit skipped the check entirely when logged out.
    isPostVisibleToViewer(p, viewerId || '', friendIds)
  );
}

// Groups the user has explicitly unfollowed — their posts are hidden from the feed.
async function loadUnfollowedGroupIds(userId?: string): Promise<string[]> {
  if (!userId) return [];
  const { data: unfollowRows } = await dataClient
    .from('group_follows')
    .select('group_id')
    .eq('user_id', userId);
  return ((unfollowRows || []) as Array<{ group_id: string }>).map(row => row.group_id);
}

// Audience filtering lives in the canonical @/lib/postVisibility module and is
// mirrored in the feedTimeline Edge Function (the enforcing boundary for a
// signed-in viewer, whose central JWT is not accepted by the posts project).
// Keeping ONE implementation here is what stops the copies from drifting again.

/**
 * One server page of the feed. A post card is roughly half a viewport tall, so
 * 10 covers two full screens plus scroll room. The server reads `limit + 1`
 * rows to learn whether another page exists; it never truncates the timeline
 * at a fixed maximum.
 */
const POSTS_PER_PAGE = 10;

/**
 * Total order: newest first, `id` breaking ties. Deterministic, so two pages
 * can be compared without relying on array positions or offset arithmetic.
 */
function compareFeedPosts(
  a: { created_at: string; id: string },
  b: { created_at: string; id: string }
): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/** Dedupe by post id, keeping the first occurrence (do.md §10). */
function dedupeById<T extends { id: string }>(posts: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const post of posts) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    out.push(post);
  }
  return out;
}

export const useHomeFeed = () => {
  // The server owns the timeline. This hook holds only the pages already shown,
  // plus the `(created_at, id)` cursor returned with the last page. No silent
  // 500-row cap and no client-side slice of an incomplete feed.
  const [posts, setPosts] = useState<HomeFeedPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>('idle');
  const { toast } = useToast();
  const { user } = useAuth();

  // Mirrors of the values `loadMore` reads. They keep the callback referentially
  // stable, which matters because it is an IntersectionObserver callback: a new
  // identity on every cursor advance would tear down the observer mid-scroll.
  const cursorRef = useRef<FeedCursor | null>(null);
  const hasMoreRef = useRef(false);

  // Re-entrancy guard (do.md §7). IntersectionObserver can fire several times
  // for one approach to the sentinel; only one server page may be read per call.
  const loadMoreInFlight = useRef(false);

  const advanceCursor = useCallback((next: FeedCursor | null) => {
    cursorRef.current = next;
  }, []);

  const setHasMoreBoth = useCallback((next: boolean) => {
    hasMoreRef.current = next;
    setHasMore(next);
  }, []);

  /**
   * Read one server page. The enforcing boundary is the registered posts
   * project (direct RLS for a guest, the narrow cross-project Edge Function for
   * a signed-in viewer); `mapFeedPosts` re-applies the audience matrix as
   * defence-in-depth before anything is put in state.
   */
  const readPage = useCallback(async (pageCursor: FeedCursor | null) => {
    const [unfollowedGroupIds, friendIds, result] = await Promise.all([
      loadUnfollowedGroupIds(user?.id),
      loadFriendIds(user?.id),
      postsApi.getFeedTimeline({ cursor: pageCursor, limit: POSTS_PER_PAGE }),
    ]);

    if (result.error) {
      const status = statusForFeedError(result.feedErrorCode, result.error.message);
      // Sanitized: error code and counts only. No tokens, content or user ids.
      console.warn('[useHomeFeed] feed read failed', { status, code: result.error.code ?? null });
      throw new FeedRequestError(status, result.error.message);
    }

    const data = result.data ?? [];
    const mapped = mapFeedPosts(data, unfollowedGroupIds, user?.id, friendIds);
    const mappedPosts = dedupeById(mapped).sort(compareFeedPosts);
    const rawCount = result.rawCount ?? data.length;
    const more = result.hasMore === true;
    const next = result.nextCursor ?? null;

    // A page that claims to continue without a cursor cannot be paged safely.
    if (more && !next) {
      throw new FeedRequestError('query', 'The feed page is incomplete');
    }

    const status: FeedStatus = rawCount === 0 && mappedPosts.length === 0
      ? 'no-posts'
      : mappedPosts.length === 0
        ? 'none-visible'
        : 'ready';

    // Sanitized diagnostic: counts only, never rows, tokens or identifiers.
    console.debug('[useHomeFeed] feed page', {
      rawCount,
      visibleCount: mappedPosts.length,
      more,
      status,
    });
    return { posts: mappedPosts, hasMore: more, nextCursor: next, status };
  }, [user]);

  const fetchPosts = useCallback(async (resetPosts = false) => {
    try {
      setLoading(true);
      const page = await readPage(resetPosts ? null : cursorRef.current);

      if (resetPosts) {
        // An explicit refresh restarts from the top; anything already on screen
        // is replaced, which is what "refresh" means to the user.
        setPosts(page.posts);
      } else if (page.posts.length) {
        setPosts(prev => dedupeById([...prev, ...page.posts]).sort(compareFeedPosts));
      }

      // Advance even when every raw row on this page was filtered out: the
      // server cursor is what prevents the feed from stalling on a hidden page.
      if (page.nextCursor || resetPosts) advanceCursor(page.nextCursor);
      setHasMoreBoth(page.hasMore);
      setFeedStatus(page.status);
      setError(null);
    } catch (caught) {
      // The already-revealed posts are deliberately left in state: a failed
      // re-read must not destroy a feed the user is reading (do.md §14).
      const failure = caught instanceof FeedRequestError
        ? caught
        : new FeedRequestError('query', caught instanceof Error ? caught.message : 'Failed to load posts');
      setFeedStatus(failure.status);
      setError(failure.message);
      if (!posts.length) {
        toast({
          title: 'Error',
          description: 'Failed to load posts',
          variant: 'destructive'
        });
      }
    } finally {
      setLoading(false);
    }
  }, [readPage, advanceCursor, setHasMoreBoth, toast, posts.length]);

  /**
   * Fetch and append the next server page. `hasMore` and the cursor come from
   * the feed response, never from array offsets, so a post published mid-scroll
   * cannot shift or duplicate the remaining pages.
   */
  const loadMore = useCallback(async () => {
    if (loadMoreInFlight.current || !hasMoreRef.current || !cursorRef.current) return;
    loadMoreInFlight.current = true;
    try {
      const page = await readPage(cursorRef.current);
      if (page.posts.length) {
        setPosts(prev => dedupeById([...prev, ...page.posts]).sort(compareFeedPosts));
      }
      if (page.nextCursor) advanceCursor(page.nextCursor);
      setHasMoreBoth(page.hasMore);
      setFeedStatus(page.status);
      setError(null);
    } catch (caught) {
      const failure = caught instanceof FeedRequestError
        ? caught
        : new FeedRequestError('query', caught instanceof Error ? caught.message : 'Failed to load posts');
      setFeedStatus(failure.status);
      setError(failure.message);
    } finally {
      loadMoreInFlight.current = false;
    }
  }, [readPage, advanceCursor, setHasMoreBoth]);

  const refresh = useCallback(() => {
    fetchPosts(true);
  }, [fetchPosts]);

  // Single-flight guard. The timer, `visibilitychange`, `focus` and `online` can
  // all fire close together (e.g. a laptop wakes from sleep and the network
  // reconnects in the same tick); without this each would issue its own pair of
  // requests and the later responses could land out of order.
  const newPostsCheckInFlight = useRef(false);

  // Silent check for posts that appeared since the feed was loaded (e.g. by other
  // users or from another surface), and for posts that have only just become
  // authorized — a Friends-only post whose viewer has since accepted the author
  // must appear without a manual refresh (do.md §12). Only the newest server
  // page is polled; it is a freshness check, not a re-download of all history.
  const checkForNewPosts = useCallback(async () => {
    if (newPostsCheckInFlight.current) return;
    newPostsCheckInFlight.current = true;
    try {
      const page = await readPage(null);
      if (!page.posts.length) return;

      setPosts(prev => {
        const known = new Set(prev.map(p => p.id));
        // Only rows strictly newer than everything already on screen may jump to
        // the top. Older rows belong to pages the user has not reached yet.
        const boundary = prev[0];
        const fresh = page.posts.filter(
          p => !known.has(p.id) && (!boundary || compareFeedPosts(p, boundary) < 0)
        );
        return fresh.length > 0 ? [...fresh, ...prev] : prev;
      });
    } catch {
      // Polling must never disrupt the UI — ignore transient failures.
    } finally {
      newPostsCheckInFlight.current = false;
    }
  }, [readPage]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!user) return;

    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;

      const existingLike = post.likes?.find(l => l.user_id === user.id);

      if (existingLike) {
        await dataClient.from('likes').delete().eq('id', existingLike.id);
      } else {
        await dataClient.from('likes').insert({
          post_id: postId,
          user_id: user.id
        });
        
        // Create notification for post owner
        await createNotification({
          userId: post.user_id,
          actorId: user.id,
          type: 'like',
          message: 'liked your post',
          postId: postId
        });
      }

      // Optimistic UI update
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          const likes = p.likes || [];
          if (existingLike) {
            return { ...p, likes: likes.filter(l => l.id !== existingLike.id) };
          } else {
            return { 
              ...p, 
              likes: [...likes, { id: 'temp-' + Date.now(), user_id: user.id }] 
            };
          }
        }
        return p;
      }));
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to toggle like',
        variant: 'destructive'
      });
    }
  }, [posts, user, toast]);

  const createPost = useCallback(async (
    content: string, 
    media?: File[], 
    taggedUsers?: any[], 
    audience?: any,
    feeling?: { type: string; emoji: string; text: string; targetText?: string; targetId?: string },
    scheduledAt?: Date,
    location?: { name: string; address: string; lat: number; lng: number; provider: string; provider_place_id?: string },
    preUploadedMedia?: { url: string; mediaType: 'image' | 'video' }[],
    // When the viewer is publishing "as a Page" the caller passes that page's
    // id here. The post is then associated with the page through the existing
    // `page_posts` join table (the same table the page detail reads), so a post
    // published while acting as a page shows up on that page.
    pageId?: string
  ): Promise<string | undefined> => {
    if (!user || (!content.trim() && !media?.length && !preUploadedMedia?.length)) return;

    console.log('[createPost] Starting post creation', {
      hasContent: !!content?.trim(),
      mediaCount: media?.length || 0,
      preUploadedCount: preUploadedMedia?.length || 0,
      mediaFiles: media?.map(f => ({ name: f.name, type: f.type, size: f.size }))
    });

    try {
      let locationId = null;
      
      // Save location if provided
      if (location) {
        // First check if this location already exists
        if (location.provider_place_id && location.provider !== 'custom') {
          const { data: existing } = await dataClient
            .from('locations')
            .select('id')
            .eq('provider', location.provider)
            .eq('provider_place_id', location.provider_place_id)
            .single();

          if (existing) {
            locationId = existing.id;
          }
        }

        // Create new location if it doesn't exist
        if (!locationId) {
          const { data: newLocation, error: locationError } = await dataClient
            .from('locations')
            .insert({
              provider: location.provider,
              provider_place_id: location.provider_place_id,
              name: location.name,
              display_address: location.address,
              latitude: location.lat,
              longitude: location.lng,
            })
            .select('id')
            .single();

          if (locationError) {
            console.error('Error saving location:', locationError);
          } else {
            locationId = newLocation?.id;
          }
        }
      }
      // Prepare audience data. A post published while acting as a Page belongs
      // to that Page, and a Page is public by design — `pages` and `page_posts`
      // are readable without a session. The composer's personal audience (its
      // default is `friends`) therefore does NOT apply to a page post: a page
      // post is public. Persisting the personal `friends` default here is what
      // previously made every page post invisible to everyone but the admin,
      // because visibility enforcement hid it from the page's viewers and
      // PageDetail dropped the unmatched `page_posts` link.
      const audienceData = pageId ? {
        audience_type: 'public',
        audience_user_ids: null,
        audience_excluded_user_ids: null,
        audience_list_id: null
      } : audience ? {
        audience_type: audience.type,
        audience_user_ids: audience.userIds || null,
        audience_excluded_user_ids: audience.excludedUserIds || null,
        audience_list_id: audience.customListId || null
      } : {
        // With no explicit audience selection the post is PUBLIC, matching the
        // `audience_type` column DEFAULT. This previously defaulted to 'friends',
        // which silently published every composer's post as friends-only.
        audience_type: 'public'
      };

      // Prepare feeling data
      const feelingData = feeling ? {
        feeling_activity_type: feeling.type,
        feeling_activity_emoji: feeling.emoji,
        feeling_activity_text: feeling.text,
        feeling_activity_target_text: feeling.targetText || null,
        feeling_activity_target_id: feeling.targetId || null
      } : {};

      let mediaUrl: string | null = null;
      let mediaType: 'image' | 'video' | null = null;

      if (preUploadedMedia && preUploadedMedia.length > 0) {
        const item = preUploadedMedia[0];
        mediaUrl = item.url;
        mediaType = item.mediaType;
        console.log('[createPost] Using pre-uploaded media:', mediaUrl);
      } else if (media && media.length > 0) {
        const file = media[0];
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        const isVideo = file.type.startsWith('video/');
        const bucket = isVideo ? 'stories' : 'avatars';
        mediaType = isVideo ? 'video' : 'image';
        
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const fileName = `${user.id}/${uniqueId}.${fileExt}`;
        
        console.log(`[createPost] Uploading file:`, {
          fileName,
          type: file.type,
          size: file.size,
          bucket,
          mediaType
        });

        const { error: uploadError, data: uploadData } = await dataClient.storage
          .from(bucket)
          .upload(fileName, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) {
          console.error('[createPost] Upload error:', uploadError);
          throw new Error(`Failed to upload ${mediaType}: ${uploadError.message}`);
        }

        console.log('[createPost] Upload successful:', uploadData);

        const { data: urlData } = dataClient.storage
          .from(bucket)
          .getPublicUrl(fileName);

        mediaUrl = urlData.publicUrl;
        console.log('[createPost] Public URL generated:', mediaUrl);
      }

      let postType: 'normal_post' | 'reel' = 'normal_post';
      let aspectRatio: string | null = null;

      if (mediaType === 'video' && mediaUrl) {
        try {
          const dims = await getVideoDimensions(mediaUrl);
          const classified = classifyVideoAspectRatio(dims.width, dims.height);
          postType = classified.type;
          aspectRatio = classified.aspectRatio;
          console.log('[createPost] Video dimensions:', dims, '→', classified);
        } catch (e) {
          console.warn('[createPost] Could not detect video dimensions, using normal_post');
        }
      }

      const postData: any = {
        content: content || null,
        user_id: user.id,
        type: postType,
        media_url: mediaUrl,
        media_type: mediaType,
        aspect_ratio: aspectRatio,
        ...audienceData,
        ...feelingData,
        ...(location && {
          location_id: locationId,
          location_name: location.name,
          location_address: location.address,
          location_lat: location.lat,
          location_lng: location.lng,
          location_provider: location.provider
        }),
        ...(scheduledAt && {
          status: 'scheduled',
          scheduled_at: scheduledAt.toISOString()
        })
      };

      console.log('[createPost] Creating post in DB', postData);

      const { data, error } = await postsApi.createPost(postData);

      if (error) {
        console.error('[createPost] DB insert error:', error);
        throw error;
      }

      const postId = data?.id;
      console.log('[createPost] Post created with ID:', postId);

      // Persist tagged users for this post (skip on scheduled posts; they'll be created on publish)
      if (postId && !scheduledAt && Array.isArray(taggedUsers) && taggedUsers.length > 0 && user?.id) {
        const tagRows = taggedUsers
          .filter((t: any) => t?.id)
          .map((t: any) => ({
            post_id: postId,
            tagged_user_id: t.id,
            tagged_by: user.id,
          }));
        if (tagRows.length > 0) {
          const { error: tagErr } = await dataClient.from('post_tags').insert(tagRows);
          if (tagErr) console.error('[createPost] Failed to insert post_tags:', tagErr);
        }
      }

      // Associate a post published while acting as a Page with that Page. The
      // direct data-client write stamps `shared_by` with the caller's id and is
      // subject to the posts project's own policies. The link is best-effort:
      // the post itself is already published, so a failed association is
      // reported without losing the post.
      let pageLinked = true;
      if (pageId && postId && !scheduledAt) {
        const { error: pageLinkError } = await dataClient
          .from('page_posts')
          .insert({ page_id: pageId, post_id: postId, shared_by: user.id });
        if (pageLinkError) {
          pageLinked = false;
          console.error('[createPost] Failed to link post to page:', pageLinkError);
        }
      }

      toast(pageLinked
        ? {
            title: 'Success',
            description: scheduledAt ? 'Post scheduled successfully' : 'Post created successfully'
          }
        : {
            title: 'Published, but not added to the page',
            description: 'The post was created but could not be added to the page.',
            variant: 'destructive'
          }
      );

      if (!scheduledAt) {
        window.dispatchEvent(new CustomEvent(POST_CREATED_EVENT));
        refresh();
      }
      
      console.log('[createPost] Post creation complete');
      return postId;
    } catch (error: any) {
      console.error('[createPost] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create post',
        variant: 'destructive'
      });
      throw error;
    }
  }, [user, toast, refresh]);

  // The initial read, gated on a resolved session.
  //
  // The Home feed is the one surface that requires a viewer, so there is nothing
  // to fetch for a guest. `user` is the identity decoded from the verified
  // session, so this is the same check the route guard makes — not a second rule
  // and not a client-supplied id.
  //
  // The gate matters in three places, not one:
  //
  //   * on a direct load of `/`, `user` is still null on the first render
  //     because the session has not been read yet, so an unguarded mount would
  //     fire the request during the authentication transition (do.md §9);
  //   * `GroupDetail`, `PageDetail` and `CreatePost` call this hook purely for
  //     `createPost`, and those routes are guest-readable. Without the gate a
  //     visitor browsing a public group would pull the whole Home timeline they
  //     are not allowed to see the page for;
  //   * it keeps the feed consistent with the page, so a future route that
  //     mounts the hook without the guard still cannot leak a request.
  //
  // The dependency is the user's ID, not the `user` object.
  //
  // `useAuth` returns a fresh object on every call, so an effect keyed on
  // `user` re-runs on every render and refetches the timeline forever — a
  // request loop rather than a feed. The id is a primitive that changes only
  // when the viewer actually changes, so this runs on sign-in, on sign-out, and
  // on a genuine account switch, and not in between.
  const viewerId = user?.id ?? null;

  // `fetchPosts` is read through a ref for the same reason: it is a useCallback
  // whose identity tracks `user`, and listing it here would put the object
  // identity back into the dependency list by the back door.
  const fetchPostsRef = useRef(fetchPosts);
  fetchPostsRef.current = fetchPosts;

  useEffect(() => {
    if (!viewerId) return;
    fetchPostsRef.current(true);
  }, [viewerId]);

  // Poll for new posts, catch up instantly when the tab becomes visible again or
  // the network comes back, and refresh immediately when any surface dispatches
  // POST_CREATED_EVENT.
  //
  // `focus` and `online` are what actually make another user's Friends post show
  // up "immediately": the previous version relied on the timer alone, so a viewer
  // who never switched tabs or reloaded waited out the full interval even though
  // the post was already published and already authorized for them.
  useEffect(() => {
    // Same gate as the initial read above, and the same reason: keyed on the id
    // so a re-render cannot re-arm the pollers.
    if (!viewerId) return;

    const onVisible = () => {
      if (!document.hidden) checkForNewPosts();
    };
    // `focus` covers alt-tab back into an already-visible window, which never
    // fires `visibilitychange`; it also fires on returning from a background tab.
    const onFocus = () => {
      if (!document.hidden) checkForNewPosts();
    };
    // A reconnect means anything missed while offline is now reachable, and a
    // poll that failed during the outage would otherwise wait a full interval.
    const onOnline = () => checkForNewPosts();
    const onPostCreated = () => checkForNewPosts();
    const interval = window.setInterval(() => {
      if (!document.hidden) checkForNewPosts();
    }, FEED_POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener(POST_CREATED_EVENT, onPostCreated);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener(POST_CREATED_EVENT, onPostCreated);
    };
  }, [viewerId, checkForNewPosts]);

  return {
    posts,
    loading,
    // Feed-scoped error and status, so a failed feed can render its own state
    // without touching any other Home section (and never looks like "empty").
    error,
    feedStatus,
    hasMore,
    loadMore,
    refresh,
    toggleLike,
    createPost
  };
};

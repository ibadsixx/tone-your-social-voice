import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { postsApi } from '@/api';
import { gateway } from '@/lib/gateway';
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
    profiles: {
      username: string;
      display_name: string;
      profile_pic: string | null;
    };
  } | null;
}

// The gateway has no server push for table changes. `GatewayChannel`
// (src/lib/gateway.ts) stores `postgres_changes` callbacks but never opens a
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
    group_name: post.group_posts?.[0]?.groups?.name || null,
    group_id: post.group_posts?.[0]?.groups?.id || null,
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
  const { data: unfollowRows } = await gateway
    .from('group_follows' as any)
    .select('group_id')
    .eq('user_id', userId);
  return ((unfollowRows || []) as Array<{ group_id: string }>).map(row => row.group_id);
}

// Audience filtering lives in the canonical @/lib/postVisibility module and is
// mirrored in the Gateway (which is the enforcing boundary, because the
// gateway's service-role reads bypass RLS). Keeping ONE implementation here is
// what stops the three copies from drifting again.

/**
 * One page of the feed.
 *
 * Sized for balance rather than by guesswork (do.md §4): a post card is roughly
 * half a viewport tall, so 10 covers two full screens plus scroll room without
 * making the first paint carry a heavy list. The timeline itself is fetched in
 * one request, so the page size now costs a render rather than a round trip.
 */
const POSTS_PER_PAGE = 10;

/**
 * A position in the feed, used instead of an offset (do.md §8, §9).
 *
 * `created_at` is not unique — many posts can share a timestamp — so `id` is
 * carried alongside it to break the tie. An offset cannot do this: a post
 * created while the user is scrolling shifts every later page by one row, which
 * duplicates one post and silently drops another.
 */
type FeedCursor = { created_at: string; id: string };

function cursorOf(post: { id: string; created_at: string }): FeedCursor {
  return { created_at: post.created_at, id: post.id };
}

/**
 * Total order: newest first, `id` breaking ties. Deterministic, so the same
 * timeline always yields the same sequence and the cursor can binary-search it.
 */
function compareFeedPosts(
  a: { created_at: string; id: string },
  b: { created_at: string; id: string }
): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/** Index of the first post strictly after `cursor` — where the next page starts. */
function indexAfterCursor(feed: HomeFeedPost[], cursor: FeedCursor | null): number {
  if (!cursor) return 0;
  let lo = 0;
  let hi = feed.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    // `> 0` means strictly older than the cursor, i.e. comes after it.
    if (compareFeedPosts(feed[mid], cursor) > 0) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The next page after `cursor`, or an empty array at the end of the feed. */
function pageAfter(feed: HomeFeedPost[], cursor: FeedCursor | null): HomeFeedPost[] {
  const start = indexAfterCursor(feed, cursor);
  if (start >= feed.length) return [];
  return feed.slice(start, start + POSTS_PER_PAGE);
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
  // `posts` is what the user has been shown. `timeline` is the whole authorized
  // feed, read once; pages are revealed from it as the user scrolls.
  const [posts, setPosts] = useState<HomeFeedPost[]>([]);
  const [timeline, setTimeline] = useState<HomeFeedPost[]>([]);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Mirrors of the two values `loadMore` reads. They keep `loadMore` referentially
  // stable, which matters because it is an IntersectionObserver callback: a new
  // function identity on every cursor advance would tear down and rebuild the
  // observer mid-scroll.
  const timelineRef = useRef<HomeFeedPost[]>([]);
  const cursorRef = useRef<FeedCursor | null>(null);

  // Re-entrancy guard (do.md §7). IntersectionObserver can fire several times
  // for one approach to the sentinel; only one page may be revealed per call.
  const loadMoreInFlight = useRef(false);

  const advanceCursor = useCallback((next: FeedCursor | null) => {
    cursorRef.current = next;
    setCursor(next);
  }, []);

  const setTimelineBoth = useCallback((next: HomeFeedPost[]) => {
    timelineRef.current = next;
    setTimeline(next);
  }, []);

  /**
   * The one request the feed makes. It returns every post this viewer may see,
   * in a stable total order, with no pagination applied.
   */
  const fetchTimeline = useCallback(async (): Promise<HomeFeedPost[]> => {
    // The feed read and the two lookups that feed the client-side filter are
    // independent, so they start together.
    //
    // This is not a privacy trade-off. The Gateway is the enforcing boundary
    // (service-role reads bypass RLS) and already returns only rows this viewer
    // may see, so the timeline is correctly scoped whatever the lookups
    // return. `mapFeedPosts` then applies the same matrix again before anything
    // is put in state, so the client check stays defence-in-depth and no
    // unfiltered row is ever rendered. The lookups are still re-read on every
    // check, so a just-accepted friendship is never served from a stale set.
    const [unfollowedGroupIds, friendIds, { data, error }] = await Promise.all([
      loadUnfollowedGroupIds(user?.id),
      loadFriendIds(user?.id),
      postsApi.getFeedTimeline(),
    ]);

    if (error) throw error;
    return dedupeById(mapFeedPosts(data, unfollowedGroupIds, user?.id, friendIds))
      .sort(compareFeedPosts);
  }, [user]);

  const fetchPosts = useCallback(async (resetPosts = false) => {
    try {
      setLoading(true);
      const list = await fetchTimeline();
      setTimelineBoth(list);

      if (resetPosts) {
        // An explicit refresh restarts from the top; anything already on screen
        // is replaced, which is what "refresh" means to the user.
        const first = pageAfter(list, null);
        setPosts(first);
        advanceCursor(first.length ? cursorOf(first[first.length - 1]) : null);
      } else {
        const fresh = pageAfter(list, cursorRef.current);
        if (fresh.length) {
          setPosts(prev => dedupeById([...prev, ...fresh]));
          advanceCursor(cursorOf(fresh[fresh.length - 1]));
        }
      }

      setError(null);
    } catch (error: any) {
      // The already-revealed posts are deliberately left in state: a failed
      // re-read must not destroy a feed the user is reading (do.md §14).
      setError(error?.message || 'Failed to load posts');
      toast({
        title: 'Error',
        description: 'Failed to load posts',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [fetchTimeline, advanceCursor, setTimelineBoth, toast]);

  /**
   * Reveal the next page. This is a read from the already-fetched timeline, not
   * a request, so it cannot fail, cannot race and cannot leave the feed empty
   * (do.md §6, §7, §14).
   */
  const loadMore = useCallback(() => {
    if (loadMoreInFlight.current) return;
    loadMoreInFlight.current = true;
    try {
      const fresh = pageAfter(timelineRef.current, cursorRef.current);
      // No rows after the cursor means the end of the feed: stop (do.md §13).
      if (!fresh.length) return;
      setPosts(prev => dedupeById([...prev, ...fresh]));
      advanceCursor(cursorOf(fresh[fresh.length - 1]));
    } finally {
      loadMoreInFlight.current = false;
    }
  }, [advanceCursor]);

  /** Is there anything left to reveal? Drives the sentinel and the end marker. */
  const hasMore = useMemo(
    () => indexAfterCursor(timeline, cursor) < timeline.length,
    [timeline, cursor]
  );

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
  // must appear without a manual refresh (do.md §12).
  const checkForNewPosts = useCallback(async () => {
    if (newPostsCheckInFlight.current) return;
    newPostsCheckInFlight.current = true;
    try {
      // Started together with the feed read for the same reason as `fetchPosts`:
      // the two lookups are inputs to the client-side filter, not prerequisites
      // for the request itself.
      const [unfollowedGroupIds, friendIds, { data, error }] = await Promise.all([
        loadUnfollowedGroupIds(user?.id),
        loadFriendIds(user?.id),
        postsApi.getFeedTimeline(),
      ]);
      if (error || !data || data.length === 0) return;

      const latest = dedupeById(mapFeedPosts(data, unfollowedGroupIds, user?.id, friendIds))
        .sort(compareFeedPosts);
      if (!latest.length) return;

      setPosts(prev => {
        const known = new Set(prev.map(p => p.id));
        // Only rows strictly newer than everything already on screen may jump to
        // the top. A row that sorts *after* the first revealed post is older
        // history the user has not reached yet; prepending it would reorder the
        // feed and, for a row the user has already scrolled past, look like a
        // duplicate. Those rows stay in the timeline and are revealed in order
        // by `loadMore`, which keeps the cursor honest (do.md §9).
        const boundary = prev[0];
        const fresh = latest.filter(
          p => !known.has(p.id) && (!boundary || compareFeedPosts(p, boundary) < 0)
        );
        return fresh.length > 0 ? [...fresh, ...prev] : prev;
      });

      // Keep the timeline current so `hasMore` and later pages see the new rows.
      setTimelineBoth(dedupeById([...latest, ...timelineRef.current]).sort(compareFeedPosts));
    } catch {
      // Polling must never disrupt the UI — ignore transient failures.
    } finally {
      newPostsCheckInFlight.current = false;
    }
  }, [user, setTimelineBoth]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!user) return;

    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;

      const existingLike = post.likes?.find(l => l.user_id === user.id);

      if (existingLike) {
        await gateway.from('likes').delete().eq('id', existingLike.id);
      } else {
        await gateway.from('likes').insert({
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
    preUploadedMedia?: { url: string; mediaType: 'image' | 'video' }[]
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
          const { data: existing } = await gateway
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
          const { data: newLocation, error: locationError } = await gateway
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
      // Prepare audience data
      const audienceData = audience ? {
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

        const { error: uploadError, data: uploadData } = await gateway.storage
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

        const { data: urlData } = gateway.storage
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
          const { error: tagErr } = await gateway.from('post_tags').insert(tagRows);
          if (tagErr) console.error('[createPost] Failed to insert post_tags:', tagErr);
        }
      }

      toast({
        title: 'Success',
        description: scheduledAt ? 'Post scheduled successfully' : 'Post created successfully'
      });

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

  useEffect(() => {
    fetchPosts(true);
  }, []);

  // Poll for new posts, catch up instantly when the tab becomes visible again or
  // the network comes back, and refresh immediately when any surface dispatches
  // POST_CREATED_EVENT.
  //
  // `focus` and `online` are what actually make another user's Friends post show
  // up "immediately": the previous version relied on the timer alone, so a viewer
  // who never switched tabs or reloaded waited out the full interval even though
  // the post was already published and already authorized for them.
  useEffect(() => {
    if (!user) return;

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
  }, [user, checkForNewPosts]);

  return {
    posts,
    loading,
    // Feed-scoped error, so a failed feed can render its own error state without
    // touching the state of any other Home section.
    error,
    hasMore,
    loadMore,
    refresh,
    toggleLike,
    createPost
  };
};

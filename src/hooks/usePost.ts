import { useState, useEffect } from 'react';
import { postsApi } from '@/api';
import { isPostVisibleToViewer, loadFriendIds } from '@/lib/postVisibility';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type?: 'image' | 'video' | null;
  created_at: string;
  type: 'normal_post' | 'profile_picture_update' | 'cover_photo_update' | 'shared_post' | 'reel';
  // Reel length, in seconds. Read by the public content page to emit a
  // VideoObject with a real `duration`; absent on non-reel posts.
  duration?: number | null;
  shared_post_id?: string | null;
  audience_type?: string;
  visibility?: string | null;
  status?: string | null;
  audience_user_ids?: string[];
  audience_excluded_user_ids?: string[];
  audience_list_id?: string;
  feeling_activity_type?: string | null;
  feeling_activity_emoji?: string | null;
  feeling_activity_text?: string | null;
  feeling_activity_target_text?: string | null;
  feeling_activity_target_id?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_provider?: string | null;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
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
  likes?: { id: string; user_id: string }[];
  comments?: { id: string; content: string; profiles: { display_name: string } }[];
}

// A transient read failure - a dropped connection, a timeout, a Gateway 5xx, a
// temporarily unreadable/malformed body, a blip on the database behind the
// Gateway - does NOT prove that the requested post is missing. `usePost` must
// never turn one into `notFound`: PublicContentPage pairs `notFound` with
// `applyNoIndexSeo`, so a single failed render would de-index a post that is
// genuinely public. One short, bounded retry gives a one-off blip a chance to
// clear before the failure is surfaced (separately from `notFound`).
const TRANSIENT_MAX_ATTEMPTS = 2;
const TRANSIENT_RETRY_DELAY_MS = 250;

const waitForRetry = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export const usePost = (postId?: string) => {
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // A transient read failure, kept deliberately separate from `notFound`. It is
  // a recoverable "could not load" state, never an indexability decision.
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchPost = async () => {
    // No id at all is a confirmed absence, not a transient failure.
    if (!postId) {
      setPost(null);
      setNotFound(true);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    setError(null);

    for (let attempt = 1; attempt <= TRANSIENT_MAX_ATTEMPTS; attempt++) {
      let data: Post | null = null;
      let apiError: { message: string; code?: string } | null = null;

      try {
        ({ data, error: apiError } = await postsApi.getPostById(postId));
      } catch (thrown: unknown) {
        // A thrown transport error is the same class as a returned one.
        apiError = { message: errorMessage(thrown) };
      }

      if (apiError) {
        // Transient. Retry once, then surface the failure as `error` - never as
        // `notFound`, so a public post is never de-indexed by a failed fetch.
        if (attempt < TRANSIENT_MAX_ATTEMPTS) {
          await waitForRetry(TRANSIENT_RETRY_DELAY_MS);
          continue;
        }
        console.error('Error fetching post:', apiError);
        setPost(null);
        setError(apiError.message || 'Failed to load post');
        toast({
          title: 'Error',
          description: 'Failed to load post',
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }

      // The authorized read succeeded and returned no row. That is a *confirmed*
      // absence: the post does not exist for this viewer, or the Gateway
      // withheld it because it is not accessible. Only this is `notFound`.
      if (!data) {
        setPost(null);
        setNotFound(true);
        setError(null);
        setLoading(false);
        return;
      }

      // Defense in depth for the direct `/post/:id` surface, which previously
      // applied no audience check at all. The Gateway refuses a row the viewer
      // may not see and the RLS policy enforces it for direct Supabase reads;
      // this keeps a friends-only post from rendering if any other caller ever
      // returns the row. An unauthorized post is reported as not found so the
      // page does not confirm that a private post exists.
      const viewerId = user?.id || '';
      const friendIds = await loadFriendIds(viewerId);
      if (!isPostVisibleToViewer(data, viewerId, friendIds)) {
        setPost(null);
        setNotFound(true);
        setError(null);
        setLoading(false);
        return;
      }

      const postWithTypedMedia = {
        ...data,
        media_type: data.media_type as 'image' | 'video' | null,
        // The API returns `duration` as whatever Postgres inferred for the
        // numeric column, which may arrive as a string. The VideoObject
        // duration must be a number, so coerce it here - once - rather than
        // guarding for it in every consumer.
        duration: typeof data.duration === 'number' ? data.duration : null,
        shared_post: data.shared_post
      };
      setPost(postWithTypedMedia);
      setError(null);
      setLoading(false);
      return;
    }
  };

  useEffect(() => {
    fetchPost();
  }, [postId, user?.id]);

  return {
    post,
    loading,
    notFound,
    error,
    refetch: fetchPost
  };
};

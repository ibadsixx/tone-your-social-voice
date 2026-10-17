import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { gateway } from '@/lib/gateway';
import { postsApi } from '@/api';
import { POST_CREATED_EVENT } from '@/hooks/useHomeFeed';

// The Page counterpart of the personal `CoverPhotoEditor`. It renders the same
// cover band (the shared ProfileHeader owns the surrounding template) but writes
// the chosen image to the `pages` row instead of the viewer's `profiles` row.
// Keeping this in its own component is what lets ProfileHeader stay a single
// shared template for both people and pages.
//
// Changing a Page's cover ALSO publishes a post on that Page, exactly like the
// personal editor does. The page's Posts feed is read from the `page_posts` link
// table (api/pageContent.ts), so updating `pages.cover_image` alone could never
// surface the change: a post had to be created AND linked. The post reuses the
// existing `cover_photo_update` type so the shared `Post` card renders it as a
// cover change, and the Gateway enforces that only the page admin may link a
// post to the page (it stamps `shared_by` and forces the post public).
interface PageCoverPhotoEditorProps {
  pageId: string;
  coverImage: string | null;
  /** True only for the page admin acting as the page. */
  canEdit: boolean;
  onUploaded: (url: string) => void;
  /**
   * Called once the cover post is linked to the page, so the caller can
   * invalidate its feed. The page feed is keyed off `postsVersion`, which
   * remounts the section and re-reads `page_posts`.
   */
  onPostCreated?: () => void;
}

/** One cover post attempt, remembered so a retry can never duplicate it. */
type CoverPostState = {
  /** The `posts.id` once the post row exists; null until it is created. */
  postId: string | null;
  /** True once the `page_posts` link is stored (the post is visible on the page). */
  linked: boolean;
};

const PageCoverPhotoEditor = ({ pageId, coverImage, canEdit, onUploaded, onPostCreated }: PageCoverPhotoEditorProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  // The saved cover awaiting a post, kept so the owner can retry the post
  // WITHOUT uploading the image again (the upload and the row update already
  // succeeded; only the announcement is outstanding).
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string | null>(null);
  // Per-URL progress for the cover post. Keyed by the uploaded URL because the
  // storage path embeds `Date.now()`, so every genuinely new upload is a new
  // key while a retry of the SAME upload reuses it. This is what makes the flow
  // idempotent across double-clicks, repeated callbacks and retries.
  const coverPostState = useRef<Map<string, CoverPostState>>(new Map());

  /**
   * Create the cover post for `coverImage` and link it to this page.
   *
   * Safe to call again after a partial failure: if a previous attempt stored the
   * `posts` row but failed at the link, the existing row is reused rather than a
   * second copy being inserted, and once the link is stored the whole call is a
   * no-op. Throws so the caller can surface the reason.
   */
  const ensureCoverPost = async (coverImage: string) => {
    if (!user?.id) throw new Error('You must be signed in to publish a post for this page');

    let state = coverPostState.current.get(coverImage);
    if (state?.linked) return; // Already published on the page: nothing to do.

    if (!state?.postId) {
      // The post is authored by the admin's user account (pages have no user of
      // their own) and is public, matching `useHomeFeed.createPost` for a page.
      const { data, error } = await postsApi.createPost({
        user_id: user.id,
        content: '',
        media_url: coverImage,
        media_type: 'image',
        type: 'cover_photo_update',
        audience_type: 'public',
        audience_user_ids: null,
        audience_excluded_user_ids: null,
      });
      if (error) throw new Error(error.message || 'Failed to create the cover post');

      const postId = data?.id;
      if (!postId) throw new Error('The cover post was created without an id');

      // Remember the row before linking: if the link below fails, the retry
      // re-links THIS post instead of inserting a duplicate announcement.
      state = { postId, linked: false };
      coverPostState.current.set(coverImage, state);
    }

    // Associate the post with the page. The page feed reads `page_posts`, so
    // this link is what makes the cover change visible on the page at all. The
    // Gateway checks the caller administers the page, stamps `shared_by` and
    // forces the post public.
    const { error: linkError } = await gateway.from('page_posts').insert({
      page_id: pageId,
      post_id: state.postId,
      shared_by: user.id,
    });
    if (linkError) throw new Error(linkError.message || 'Failed to add the post to the page');

    state.linked = true;
    coverPostState.current.set(coverImage, state);
  };

  const handleUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${pageId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await gateway.storage
        .from('covers')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = gateway.storage.from('covers').getPublicUrl(path);
      const cover_image = urlData.publicUrl;
      const { error } = await gateway.from('pages').update({ cover_image }).eq('id', pageId);
      if (error) throw error;

      // The new cover is always kept, even if the post below fails — the owner
      // asked for a new cover and the row update is the source of truth for the
      // header. The announcement is best-effort and separately retryable.
      onUploaded(cover_image);

      try {
        await ensureCoverPost(cover_image);
        setPendingCoverUrl(null);
        window.dispatchEvent(new CustomEvent(POST_CREATED_EVENT));
        onPostCreated?.();
        toast({ title: 'Cover updated', description: 'The new cover is live and published as a page post.' });
      } catch (postError) {
        // The cover is saved; only the post is outstanding. Keep the URL so the
        // owner can retry the post alone instead of re-uploading the image.
        console.error('[PageCoverPhotoEditor] cover post failed:', postError);
        setPendingCoverUrl(cover_image);
        toast({
          title: 'Cover updated, but the post could not be published',
          description: postError instanceof Error ? postError.message : 'Use "Retry post" to publish it.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not update the cover photo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  // Retry ONLY the post for an already-saved cover. No upload and no page-row
  // update happen here, so a failed post never costs the owner the image.
  const handleRetryPost = async () => {
    if (!pendingCoverUrl || posting) return;
    setPosting(true);
    try {
      await ensureCoverPost(pendingCoverUrl);
      setPendingCoverUrl(null);
      window.dispatchEvent(new CustomEvent(POST_CREATED_EVENT));
      onPostCreated?.();
      toast({ title: 'Post published', description: 'The cover change is now on the page.' });
    } catch (postError) {
      console.error('[PageCoverPhotoEditor] cover post retry failed:', postError);
      toast({
        title: 'Post still could not be published',
        description: postError instanceof Error ? postError.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <div className="relative w-full h-36 md:h-56 overflow-hidden bg-gradient-to-br from-primary/20 to-purple-500/20">
        {coverImage && (
          <img src={coverImage} alt="Page cover" className="w-full h-full object-cover" loading="eager" decoding="async" />
        )}
        {canEdit && (
          <Button
            size="sm"
            variant="secondary"
            className="absolute bottom-3 right-3"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="h-4 w-4 mr-2" />
            {uploading ? 'Uploading...' : 'Edit cover'}
          </Button>
        )}
        {canEdit && pendingCoverUrl && !uploading && (
          <Button
            size="sm"
            variant="destructive"
            className="absolute bottom-3 left-3"
            onClick={handleRetryPost}
            disabled={posting}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${posting ? 'animate-spin' : ''}`} />
            {posting ? 'Publishing...' : 'Retry post'}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = '';
          }}
        />
      </div>
    </>
  );
};

export default PageCoverPhotoEditor;

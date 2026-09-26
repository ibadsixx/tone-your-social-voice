import { AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Post from './Post';
import ProfilePhotosGrid from './ProfilePhotosGrid';
import ProfileReelsGrid from './ProfileReelsGrid';
import { useProfileContent } from '@/hooks/useProfileContent';
import { useInfiniteScrollSentinel } from '@/hooks/useInfiniteScrollSentinel';
import type { ProfileContentKind } from '@/api/profileContent';

/**
 * One Profile content section (Posts, Photos, Reels or Shared), paged one item
 * per request (do.md "Profile content pages").
 *
 * Each section owns its own cursor and its own loaded items, so the four are
 * genuinely independent: opening Photos does not wait for, reuse, or disturb the
 * Posts feed, and returning to Posts resumes where the visitor left off instead
 * of refetching what is already on screen.
 *
 * A section stays MOUNTED while another is active — it is hidden, not unmounted,
 * which is what preserves its cursor — but only the active one is `enabled`, so
 * only the active one asks the network for anything.
 */
interface ProfileContentSectionProps {
  kind: ProfileContentKind;
  /** Which section this is, for the empty-state wording. */
  variant: 'all' | 'photos' | 'reels' | 'shared';
  profileId: string;
  /** Only the active section fetches. */
  enabled: boolean;
  active: boolean;
  coverPic?: string | null;
}

const EMPTY_LABEL: Record<ProfileContentSectionProps['variant'], string> = {
  all: 'No posts yet',
  photos: 'No photos found',
  reels: 'No reels found',
  shared: 'No shared posts found',
};

export function ProfileContentSection({
  kind,
  variant,
  profileId,
  enabled,
  active,
  coverPic,
}: ProfileContentSectionProps) {
  const { items, loading, loadingMore, error, hasMore, done, loadMore, retry } = useProfileContent(
    profileId,
    kind,
    { enabled }
  );

  const { sentinelRef } = useInfiniteScrollSentinel({
    onReach: loadMore,
    enabled: active && !done,
    hasMore,
    // Re-check the bottom of the list whenever an item lands.
    watch: items.length,
  });

  // The first item is in flight and nothing is on screen yet: show a skeleton
  // for the CONTENT ONLY. The section chrome and the profile header stay
  // exactly where they are, and already-loaded items are never replaced by one
  // (do.md 12) — which is why this is a per-section check, not a page-level
  // `if (loading)` that unmounts everything.
  const showSkeleton = loading && items.length === 0;

  // An inactive section stays MOUNTED — that is what preserves its cursor and its
  // loaded items — but renders nothing. Leaving its list in the DOM would mean
  // four copies of an empty state, and three of them inside the accessibility
  // tree, for a section the visitor did not open.
  if (!active) return null;

  return (
    <div className="flex-1" data-testid={`profile-section-body-${variant}`}>
      {variant === 'photos' ? (
        <>
          <ProfilePhotosGrid posts={items} loading={showSkeleton} coverPic={coverPic} />
          <SectionFooter
            sentinelRef={sentinelRef}
            hasItems={items.length > 0}
            loading={loadingMore}
            error={error}
            done={done}
            onRetry={retry}
          />
        </>
      ) : variant === 'reels' ? (
        <>
          <ProfileReelsGrid posts={items} loading={showSkeleton} />
          <SectionFooter
            sentinelRef={sentinelRef}
            hasItems={items.length > 0}
            loading={loadingMore}
            error={error}
            done={done}
            onRetry={retry}
          />
        </>
      ) : (
        <div className="space-y-4">
          {showSkeleton ? (
            <div className="space-y-4" data-testid="profile-section-skeleton">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-muted" />
                    <div className="space-y-2">
                      <div className="h-4 w-32 rounded bg-muted" />
                      <div className="h-3 w-24 rounded bg-muted" />
                    </div>
                  </div>
                  <div className="h-20 w-full rounded bg-muted" />
                </CardContent>
              </Card>
            </div>
          ) : items.length === 0 ? (
            done && !error ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">{EMPTY_LABEL[variant]}</p>
                </CardContent>
              </Card>
            ) : null
          ) : (
            items.map((post) => (
              <Post
                key={post.id}
                id={post.id}
                user_id={post.user_id}
                content={post.content}
                media_url={post.media_url}
                media_type={post.media_type}
                created_at={post.created_at}
                type={post.type}
                shared_post_id={post.shared_post_id}
                profiles={post.profiles}
                shared_post={post.shared_post}
              />
            ))
          )}
          <SectionFooter
            sentinelRef={sentinelRef}
            hasItems={items.length > 0}
            loading={loadingMore}
            error={error}
            done={done}
            onRetry={retry}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The end-of-list area: the sentinel itself, plus the small status row.
 *
 * The row is a live region so a screen reader is told when more content is on
 * its way, when the list has ended, and when something failed — without the
 * visitor having to go looking for it. On failure the already-loaded items stay
 * on screen and the retry asks for exactly the item that was missing, because
 * the cursor only advances on a successful response.
 */
function SectionFooter({
  sentinelRef,
  hasItems,
  loading,
  error,
  done,
  onRetry,
}: {
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  hasItems: boolean;
  loading: boolean;
  error: string | null;
  done: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="pt-4">
      {/* The sentinel must sit AFTER the loaded content, so it is only ever in
          reach once the visitor has actually reached the end of the list. */}
      <div ref={sentinelRef} data-testid="profile-content-sentinel" aria-hidden="true" />

      <div
        role="status"
        aria-live="polite"
        data-testid="profile-content-status"
        className="flex min-h-[2.5rem] flex-col items-center justify-center gap-2 py-2 text-center"
      >
        {error ? (
          <div className="flex flex-col items-center gap-2" data-testid="profile-content-error">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : loading ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading more…
          </span>
        ) : done && hasItems ? (
          <span className="text-sm text-muted-foreground">You&apos;re all caught up</span>
        ) : null}
      </div>
    </div>
  );
}

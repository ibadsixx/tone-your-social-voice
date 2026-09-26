import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHomeFeed } from '@/hooks/useHomeFeed';
import Post from '@/components/Post';
import NewPost from '@/components/NewPost';
import Stories from '@/components/Stories';

import HorizontalReelsSection from '@/components/reels/HorizontalReelsSection';
import { PeopleYouMayKnow } from '@/components/PeopleYouMayKnow';
import PageContainer from '@/components/PageContainer';

const Home = () => {
  const { user } = useAuth();
  const { posts, loading, error, hasMore, loadMore, refresh, createPost, toggleLike } = useHomeFeed();
  const navigate = useNavigate();
  const isGuest = !user;
  // Only surface a feed error once the feed has actually given up — a failed
  // background poll (which never touches `posts`) must not blank the feed.
  const feedError = error && !loading ? error : null;

  const feedSentinelRef = useRef<HTMLDivElement>(null);
  // Tracks whether a page reveal is in progress so the status row can say so.
  // `loadMore` reveals from the already-fetched timeline, so this is a render
  // frame rather than a round trip.
  const [loadingMore, setLoadingMore] = useState(false);

  // Automatic pagination (do.md §2, §3).
  //
  // An IntersectionObserver on a sentinel under the feed, rather than a `scroll`
  // listener: a scroll handler runs on every frame of every scroll, while this
  // runs only when the sentinel actually enters the band.
  //
  // `rootMargin` extends the viewport by 800px, so the next page is revealed
  // while the user is still ~800px from the end — inside the 500-1000px band
  // the spec asks for, so scrolling never reaches a blank gap (do.md §5).
  //
  // The observer is deliberately kept out of `loadMore`'s dependencies: it reads
  // the latest `loadMore` and `hasMore` through refs, so revealing a page cannot
  // tear the observer down and rebuild it mid-scroll. It is created once.
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  useEffect(() => {
    const node = feedSentinelRef.current;
    if (!node) return;

    // No IntersectionObserver (very old browser, or a test environment without
    // the stub) must not break the feed — the posts already loaded stay.
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const isNear = entries.some(e => e.isIntersecting);
        if (!isNear) return;
        // §7: an observer can fire repeatedly for one approach. `loadMore`
        // advances the cursor, so a repeat call reveals the *next* page rather
        // than re-requesting the same one, and it also guards re-entrancy.
        if (!hasMoreRef.current) return;
        setLoadingMore(true);
        try {
          loadMoreRef.current();
        } finally {
          setLoadingMore(false);
        }
      },
      { root: null, rootMargin: '800px 0px', threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleCreatePost = async (content: string, media?: File[], taggedUsers?: any[], audience?: any, feeling?: any, scheduledAt?: Date, location?: any, preUploadedMedia?: { url: string; mediaType: 'image' | 'video' }[]) => {
    if (!content.trim() && !media?.length && !preUploadedMedia?.length) return;
    const postId = await createPost(content, media, taggedUsers, audience, feeling, scheduledAt, location, preUploadedMedia);
    return postId;
  };

  const handleLike = (postId: string) => {
    toggleLike(postId);
  };

  const isPostLiked = (post: any) => {
    return post.likes?.some((like: any) => like.user_id === user?.id) || false;
  };

  // There is deliberately no `if (loading) return <FullPageLoader />` here.
  // `loading` is the *feed's* state, and gating the whole page on it meant the
  // shell, the stories rail, the composer, the friend suggestions and the reels
  // section all waited on the feed's request chain — which is what produced
  // "one long spinner, then every section at once". Each section now owns its
  // own loading/error/empty state (do.md §2, §3, §13).

  return (
    <div className="min-h-screen bg-background">
      {/* Stories Section — authenticated users only */}
      {user && <Stories />}

      {/* Main Content */}
      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Feed */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              {user ? (
                <Card className="hidden md:block p-6 bg-card/80 backdrop-blur-sm border-border/50 shadow-tone">
                  <NewPost onCreatePost={handleCreatePost} />
                </Card>
              ) : (
                <Card className="p-6 bg-card/80 backdrop-blur-sm border-border/50 shadow-tone">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Welcome to Tone</h2>
                      <p className="text-sm text-muted-foreground">
                        Browse public posts from the community. Sign in to react, comment and share.
                      </p>
                    </div>
                    <Button onClick={() => navigate('/auth')} className="bg-tone-gradient text-white border-0 shadow-tone-glow hover:shadow-tone">
                      Sign in
                    </Button>
                  </div>
                </Card>
              )}

              <AnimatePresence>
                {posts.length === 0 && !loading ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                      className="space-y-6"
                  >
                    {feedError ? (
                      /* Feed failed. Scoped to this section: Reels and Friend
                         Suggestions below are independent and stay visible. */
                      <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border-border/50 shadow-tone">
                        <h3 className="text-lg font-semibold text-foreground mb-2">Could not load the feed</h3>
                        <p className="text-muted-foreground mb-4">{feedError}</p>
                        <Button variant="outline" onClick={() => refresh()}>
                          Try again
                        </Button>
                      </Card>
                    ) : (
                      <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border-border/50 shadow-tone">
                        <div className="w-16 h-16 mx-auto bg-tone-purple/10 rounded-full flex items-center justify-center mb-4">
                          <Sparkles className="w-8 h-8 text-tone-purple" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">Welcome to Tone!</h3>
                        <p className="text-muted-foreground">
                          {user ? 'No posts yet. Be the first to share something amazing!' : 'No public posts yet — check back soon!'}
                        </p>
                      </Card>
                    )}
                  </motion.div>
                ) : (
                  <div className="space-y-6">
                    {/* Feed skeleton — shown only while the feed itself is in
                        flight, and only when there is nothing to show yet. */}
                    {loading && posts.length === 0 && (
                      <div className="space-y-6" aria-busy="true" aria-label="Loading posts">
                        {[0, 1, 2].map((i) => (
                          <Card key={`feed-skeleton-${i}`} className="p-6 bg-card/80 backdrop-blur-sm border-border/50 shadow-tone">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                              <div className="space-y-2 flex-1">
                                <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                                <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="h-3 w-full rounded bg-muted animate-pulse" />
                              <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    {posts.map((post, index) => (
                      <motion.div
                        key={post.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                      >
                        <Post
                          {...post}
                          onLike={handleLike}
                          isLiked={isPostLiked(post)}
                          likesCount={post.likes?.length || 0}
                          commentsCount={post.comments?.length || 0}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>

              {/* Discovery sections are siblings of the feed, not children of the
                  post loop. Previously each was rendered from inside
                  `posts.map()` at a fixed index, so neither could mount — or
                  begin its own request — until the feed had already resolved and
                  had at least 3 (or 5) posts. Mounting them here means each loads
                  and renders on its own schedule, and a failure in either leaves
                  the feed untouched (do.md §3, §10, §11, §14). Each component
                  keeps its own internal loading state. */}

              {/* Reels suggestions — every viewer */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.25 }}
              >
                <Card className="p-4 bg-card/80 backdrop-blur-sm border-border/50 shadow-tone">
                  <HorizontalReelsSection />
                </Card>
              </motion.div>

              {/* Friend suggestions — authenticated viewers only, as before */}
              {user && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 }}
                >
                  <PeopleYouMayKnow />
                </motion.div>
              )}

              {/* Feed sentinel + status row.
                  There is deliberately no "Load more posts" button: the next page
                  is revealed by an IntersectionObserver on the sentinel below
                  (do.md §1, §2, §3). The sentinel carries no content of its own —
                  it exists purely to be watched. */}
              <div ref={feedSentinelRef} aria-hidden="true" data-testid="feed-sentinel" />

              {/* Status under the feed. Kept separate from the feed itself so a
                  slow or failed next page can never blank posts the user is
                  already reading (do.md §6, §13, §14). */}
              {posts.length > 0 && (
                <div className="flex justify-center pt-6" role="status" aria-live="polite">
                  {feedError ? (
                    /* A failed refresh keeps every loaded post on screen; this is
                       the retry affordance rather than a full-page error. */
                    <Button
                      variant="outline"
                      onClick={() => refresh()}
                      className="border-border/50 hover:bg-tone-purple hover:text-white transition-all"
                    >
                      Couldn&apos;t refresh the feed — Try again
                    </Button>
                  ) : loadingMore ? (
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading more posts...
                    </span>
                  ) : hasMore ? (
                    <span className="text-sm text-muted-foreground">Keep scrolling for more</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">You&apos;re all caught up</span>
                  )}
                </div>
              )}
            </motion.div>
          </div>

          {/* Right Column - Trending Hashtags */}
          <div className="hidden lg:block">
            <div className="sticky top-6">
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  );
};

export default Home;
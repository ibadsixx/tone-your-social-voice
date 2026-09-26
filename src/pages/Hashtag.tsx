import { useParams } from 'react-router-dom';
import { useHashtagFeed } from '@/hooks/useHashtagFeed';
import { useHashtagFollow } from '@/hooks/useHashtagFollow';
import { useAuth } from '@/hooks/useAuth';
import Post from '@/components/Post';
import { Loader2, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/PageContainer';

const Hashtag = () => {
  const { tag } = useParams<{ tag: string }>();
  const { user } = useAuth();
  const { posts, loading } = useHashtagFeed(tag || '');
  const { isFollowing, loading: followLoading, toggleFollow } = useHashtagFollow(tag || '');

  // The header and the Follow button do not depend on the post feed: the title is
  // static and the follow state comes from its own hook. Only the post list waits,
  // so the page shell and the primary action appear immediately instead of behind
  // the feed's request chain.
  return (
    <PageContainer size="sm">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Hash className="h-6 w-6" />
              #{tag}
            </h1>
            <p className="text-muted-foreground mt-1">
              {loading ? (
                <span className="inline-block h-4 w-24 rounded bg-muted animate-pulse align-middle" aria-label="Loading post count" />
              ) : (
                <>
                  {posts.length} {posts.length === 1 ? 'post' : 'posts'}
                </>
              )}
            </p>
          </div>
          {user && (
            <Button
              onClick={toggleFollow}
              disabled={followLoading}
              variant={isFollowing ? 'outline' : 'default'}
              size="sm"
            >
              {followLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isFollowing ? (
                'Following'
              ) : (
                'Follow'
              )}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4" aria-label="Loading posts">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-card/60 p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12">
          <Hash className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            No posts found
          </h2>
          <p className="text-muted-foreground">
            There are no posts with this hashtag yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Post key={post.id} {...post} />
          ))}
        </div>
      )}
    </PageContainer>
  );
};

export default Hashtag;

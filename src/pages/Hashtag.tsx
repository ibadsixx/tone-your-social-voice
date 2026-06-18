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

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
              {posts.length} {posts.length === 1 ? 'post' : 'posts'}
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

      {posts.length === 0 ? (
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

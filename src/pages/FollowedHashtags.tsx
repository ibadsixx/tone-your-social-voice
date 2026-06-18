import { useFollowedHashtagsFeed } from '@/hooks/useFollowedHashtagsFeed';
import { useAuth } from '@/hooks/useAuth';
import Post from '@/components/Post';
import { Loader2, Hash, Heart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';

const FollowedHashtags = () => {
  const { user } = useAuth();
  const { posts, loading, followedHashtags } = useFollowedHashtagsFeed();

  if (!user) {
    return (
      <PageContainer size="sm">
        <Card className="p-8 text-center">
          <Hash className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Sign in to follow hashtags
          </h2>
          <p className="text-muted-foreground mb-4">
            Create an account to follow hashtags and see posts from topics you care about
          </p>
          <Button onClick={() => window.location.href = '/auth'}>
            Sign In
          </Button>
        </Card>
      </PageContainer>
    );
  }

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
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Heart className="h-6 w-6 text-primary fill-primary" />
          Following Hashtags
        </h1>
        <p className="text-muted-foreground mt-1">
          Posts from hashtags you follow
        </p>
      </div>

      {followedHashtags.length > 0 && (
        <Card className="p-4 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Your Followed Hashtags ({followedHashtags.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {followedHashtags.map((hashtag) => (
              <Link
                key={hashtag.id}
                to={`/hashtag/${hashtag.tag}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
              >
                <Hash className="h-3 w-3 text-primary" />
                <span className="text-sm font-medium text-primary">{hashtag.tag}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {followedHashtags.length === 0 ? (
        <Card className="p-8 text-center">
          <Hash className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            No followed hashtags yet
          </h2>
          <p className="text-muted-foreground mb-4">
            Start following hashtags to see posts from topics you're interested in
          </p>
          <Button asChild>
            <Link to="/">Explore Posts</Link>
          </Button>
        </Card>
      ) : posts.length === 0 ? (
        <Card className="p-8 text-center">
          <Hash className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            No posts yet
          </h2>
          <p className="text-muted-foreground">
            No posts have been made with the hashtags you follow yet
          </p>
        </Card>
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

export default FollowedHashtags;

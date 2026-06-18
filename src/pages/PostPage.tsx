import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Post from '@/components/Post';
import { usePost } from '@/hooks/usePost';
import { useAuth } from '@/hooks/useAuth';
import PageContainer from '@/components/PageContainer';

const PostPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { post, loading, notFound } = usePost(id);
  const { user } = useAuth();

  useEffect(() => {
    if (post) {
      const title = `${post.profiles.display_name}: ${
        post.content?.slice(0, 100) || 'Post'
      }`;
      document.title = title;
    }
  }, [post]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PageContainer size="sm">
          <div className="mb-4">
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </PageContainer>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">Post Not Found</h1>
          <p className="text-muted-foreground">
            This post doesn't exist or has been removed.
          </p>
          <Button onClick={() => navigate('/')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Feed
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageContainer size="sm">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Feed
        </Button>

        <Post
          id={post.id}
          user_id={post.user_id}
          content={post.content}
          media_url={post.media_url}
          media_type={post.media_type}
          created_at={post.created_at}
          type={post.type}
          shared_post_id={post.shared_post_id}
          audience_type={post.audience_type}
          audience_user_ids={post.audience_user_ids}
          audience_excluded_user_ids={post.audience_excluded_user_ids}
          audience_list_id={post.audience_list_id}
          feeling_activity_type={post.feeling_activity_type}
          feeling_activity_emoji={post.feeling_activity_emoji}
          feeling_activity_text={post.feeling_activity_text}
          feeling_activity_target_text={post.feeling_activity_target_text}
          feeling_activity_target_id={post.feeling_activity_target_id}
          location_id={post.location_id}
          location_name={post.location_name}
          location_address={post.location_address}
          location_lat={post.location_lat}
          location_lng={post.location_lng}
          location_provider={post.location_provider}
          profiles={post.profiles}
          shared_post={post.shared_post}
          likes={post.likes}
          comments={post.comments}
        />
      </PageContainer>
    </div>
  );
};

export default PostPage;

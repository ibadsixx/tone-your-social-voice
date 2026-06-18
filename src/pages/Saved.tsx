import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSavedPostsList } from '@/hooks/useSavedPostsList';
import Post from '@/components/Post';
import { Loader2, Bookmark } from 'lucide-react';
import PageContainer from '@/components/PageContainer';

const Saved = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { posts, loading, refetch } = useSavedPostsList();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    document.title = 'Saved Posts';
  }, []);

  if (authLoading || loading) {
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
          <Bookmark className="h-6 w-6" />
          Saved Posts
        </h1>
        <p className="text-muted-foreground mt-1">
          Items you've saved to revisit later
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-12">
          <Bookmark className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            No saved posts yet
          </h2>
          <p className="text-muted-foreground">
            You haven't saved any posts yet. When you do, they'll appear here.
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

export default Saved;

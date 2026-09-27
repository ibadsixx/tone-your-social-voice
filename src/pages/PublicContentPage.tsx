import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Post from '@/components/Post';
import { usePost } from '@/hooks/usePost';
import { useAuth } from '@/hooks/useAuth';
import PageContainer from '@/components/PageContainer';
import { applyNoIndexSeo, applySeo, buildContentJsonLd, buildContentSeo } from '@/lib/seo';

// One page component for all three public content URLs: /post/:id, /reel/:id and
// /photo/:id. They are one kind of thing - a row in `posts` - so giving them one
// renderer is what keeps the metadata, the schema and the not-found behavior
// identical across all three instead of drifting apart (do.md §7, §10).
//
// The route is reached by a direct hit from a search result, so `useParams` is
// the only source of the id; there is no list, no feed, and no previous page to
// fall back on. That is why the not-found branch renders its own view instead of
// navigating away: redirecting to /404 loses the URL the crawler asked for, and
// an unauthenticated visitor should see "not available", never a login form
// (do.md §13 - the Home guard must not apply to public content detail pages).
const PublicContentPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { post, loading, notFound } = usePost(id);
  const { user } = useAuth();

  // Head tags are written from the loaded content, and the canonical is derived
  // from the row's own type, so a reel reached at /reel/:id canonicalises to
  // /reel/:id even if a crawler found it at /post/:id. For a public post this is
  // the whole indexing surface: canonical + robots=index + Open Graph + schema.
  // For anything else - a draft, a friends-only post, a missing id - `isPublic`
  // is false and the page asks to be dropped from the index instead.
  useEffect(() => {
    if (!post) {
      if (notFound) applyNoIndexSeo('Content not available · Tone', window.location.href);
      return;
    }
    const seo = buildContentSeo({
      id: post.id,
      type: post.type,
      media_type: post.media_type,
      media_url: post.media_url,
      content: post.content,
      created_at: post.created_at,
      duration: typeof post.duration === 'number' ? post.duration : null,
      profiles: post.profiles,
      audience_type: post.audience_type,
      visibility: post.visibility,
      status: post.status,
    });
    applySeo({
      title: seo.title,
      description: seo.description,
      canonical: seo.canonical,
      image: seo.image,
      index: seo.isPublic,
      jsonLd: buildContentJsonLd({
        id: post.id,
        type: post.type,
        media_type: post.media_type,
        media_url: post.media_url,
        content: post.content,
        created_at: post.created_at,
        duration: typeof post.duration === 'number' ? post.duration : null,
        profiles: post.profiles,
        audience_type: post.audience_type,
        visibility: post.visibility,
        status: post.status,
        seo,
      }),
    });
  }, [post, notFound]);

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
          <h1 className="text-4xl font-bold text-foreground">
            {user ? 'Post Not Found' : "This post isn't available"}
          </h1>
          <p className="text-muted-foreground">
            {user
              ? "This post doesn't exist or has been removed."
              : "This post may be private, or it may have been removed."}
          </p>
          <Button onClick={() => navigate(user ? '/' : '/auth')}>
            {user ? 'Back to Feed' : 'Sign in'}
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
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
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

export default PublicContentPage;

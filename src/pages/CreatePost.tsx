import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NewPost from '@/components/NewPost';
import { AudienceSummary, AudienceSelector, type AudienceSelection } from '@/components/AudienceSelector';
import { useHomeFeed } from '@/hooks/useHomeFeed';

const CreatePost = () => {
  const navigate = useNavigate();
  const { createPost } = useHomeFeed();
  const [audience, setAudience] = useState<AudienceSelection>({ type: 'friends' });
  const [showAudienceSelector, setShowAudienceSelector] = useState(false);

  const handleCreatePost = async (
    content: string,
    media?: File[],
    taggedUsers?: any[],
    _audience?: any,
    feeling?: any,
    scheduledAt?: Date,
    location?: any,
    preUploadedMedia?: { url: string; mediaType: 'image' | 'video' }[]
  ) => {
    const postId = await createPost(content, media, taggedUsers, audience, feeling, scheduledAt, location, preUploadedMedia);
    navigate('/', { replace: true });
    return postId;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background border-b px-4 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1 -ml-1 rounded-full hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-base">Create Post</h1>
        </div>
        <AudienceSummary
          audience={audience}
          className="cursor-pointer hover:bg-accent/50 px-2 py-1 rounded-md transition-colors text-xs"
          onClick={() => setShowAudienceSelector(true)}
        />
      </header>
      <main className="flex-1 p-4">
        <NewPost autoExpand stickyFooter audience={audience} onAudienceChange={setAudience} onCreatePost={handleCreatePost} />
      </main>
      <AudienceSelector
        open={showAudienceSelector}
        onOpenChange={setShowAudienceSelector}
        onSelect={(newAudience) => {
          setAudience(newAudience);
          setShowAudienceSelector(false);
        }}
        currentSelection={audience}
      />
    </div>
  );
};

export default CreatePost;

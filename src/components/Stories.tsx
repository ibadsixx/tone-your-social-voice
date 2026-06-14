import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { motion } from 'framer-motion';
import { useStories } from '@/hooks/useStories';
import CreateStoryDialog from './CreateStoryDialog';
import StoryViewer from './StoryViewer';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

const Stories = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [currentUserProfile, setCurrentUserProfile] = useState<{ profile_pic: string | null; display_name: string | null } | null>(null);
  const { stories, loading, markAsViewed, deleteStory } = useStories();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedUserStories, setSelectedUserStories] = useState<any>(null);
  const [imgError, setImgError] = useState(false);

  const handleCreateStory = () => {
    setCreateDialogOpen(true);
  };

  const handleStoryClick = (userStories: any) => {
    setSelectedUserStories(userStories);
    setViewerOpen(true);
  };

  useEffect(() => {
    const fetchCurrentUserProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('profile_pic, display_name')
        .eq('id', user.id)
        .single();
      setCurrentUserProfile(data);
    };
    fetchCurrentUserProfile();
  }, [user]);

  if (loading) {
    return (
      <div className="w-full overflow-x-auto scrollbar-hide py-4">
        <div className="flex gap-2 min-w-max px-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="w-[110px] h-[190px] rounded-lg flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full overflow-x-auto scrollbar-hide py-4">
        <div className="flex gap-2 min-w-max px-6">
          {/* Create Story Card */}
          {user && (
            <motion.div
              whileHover={{ scale: 1.02, y: -2 }}
              transition={{ duration: 0.2 }}
              className="flex-shrink-0"
            >
              <Card
                onClick={handleCreateStory}
                className="relative w-[110px] h-[190px] cursor-pointer overflow-hidden border-border/50 hover:shadow-lg transition-shadow"
              >
                {!imgError && currentUserProfile?.profile_pic ? (
                  <img
                    src={currentUserProfile.profile_pic}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                    <span className="text-6xl font-bold text-primary/60">
                      {profile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background/90" />
                <div className="absolute bottom-0 left-0 right-0 p-2 text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-primary flex items-center justify-center">
                    <Plus className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">Create Story</p>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Story Cards */}
          {stories.map((userStories) => (
            <motion.div
              key={userStories.user_id}
              whileHover={{ scale: 1.02, y: -2 }}
              transition={{ duration: 0.2 }}
              className="flex-shrink-0"
            >
              <Card
                onClick={() => handleStoryClick(userStories)}
                className="relative w-[110px] h-[190px] cursor-pointer overflow-hidden border-border/50 hover:shadow-lg transition-shadow group"
              >
                {userStories.profile_pic ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${userStories.profile_pic})` }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                    <span className="text-6xl font-bold text-primary/60">
                      {userStories.display_name?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />

                {/* Username */}
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-xs font-semibold text-white drop-shadow-lg line-clamp-2">
                    {userStories.display_name}
                  </p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      <CreateStoryDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      
      {selectedUserStories && (
        <StoryViewer
          stories={selectedUserStories.stories}
          username={selectedUserStories.username}
          displayName={selectedUserStories.display_name}
          profilePic={selectedUserStories.profile_pic}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          onView={markAsViewed}
          onDelete={user?.id === selectedUserStories.user_id ? deleteStory : undefined}
        />
      )}
    </>
  );
};

export default Stories;

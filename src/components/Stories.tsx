import { useState, useEffect } from 'react';
import { Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { motion, AnimatePresence } from 'framer-motion';
import { useStories } from '@/hooks/useStories';
import StoryViewer from './StoryViewer';
import CreateStoryDialog from './CreateStoryDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';

const Stories = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [currentUserProfile, setCurrentUserProfile] = useState<{ profile_pic: string | null; display_name: string | null } | null>(null);
  const { stories, loading, markAsViewed, deleteStory } = useStories();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedUserStories, setSelectedUserStories] = useState<any>(null);
  const [imgError, setImgError] = useState(false);
  const [showStories, setShowStories] = useState(true);
  const isMobile = useIsMobile();

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
      <div className="bg-card/80 backdrop-blur-sm">
        <div className="w-full overflow-x-auto scrollbar-hide py-3 sm:py-4">
          <div className="flex gap-1.5 sm:gap-2 min-w-max px-4 sm:px-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="w-[80px] sm:w-[110px] h-[140px] sm:h-[190px] rounded-lg flex-shrink-0" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!loading && stories.length === 0) {
    return null;
  }

  const cards = (
    <>
      {/* Create Story Card */}
      {user && (
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 hidden sm:block"
        >
          <Card
            onClick={() => setCreateOpen(true)}
            className="relative w-[80px] sm:w-[110px] h-[140px] sm:h-[190px] cursor-pointer overflow-hidden border-border/50 hover:shadow-lg transition-shadow"
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
                <span className="text-4xl sm:text-6xl font-bold text-primary/60">
                  {profile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background/90" />
            <div className="absolute bottom-0 left-0 right-0 p-1.5 sm:p-2 text-center">
              <div className="w-7 h-7 sm:w-10 sm:h-10 mx-auto mb-1 sm:mb-2 rounded-full bg-primary flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-primary-foreground" />
              </div>
              <p className="text-[10px] sm:text-xs font-semibold text-foreground leading-tight">Create Story</p>
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
            className="relative w-[80px] sm:w-[110px] h-[140px] sm:h-[190px] cursor-pointer overflow-hidden border-border/50 hover:shadow-lg transition-shadow group"
          >
            {userStories.profile_pic ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${userStories.profile_pic})` }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                <span className="text-4xl sm:text-6xl font-bold text-primary/60">
                  {userStories.display_name?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
            )}

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />

            {/* Username */}
            <div className="absolute bottom-0 left-0 right-0 p-1.5 sm:p-2">
              <p className="text-[10px] sm:text-xs font-semibold text-white drop-shadow-lg line-clamp-2 leading-tight">
                {userStories.display_name}
              </p>
            </div>
          </Card>
        </motion.div>
      ))}
    </>
  );

  return (
    <div className="bg-card/80 backdrop-blur-sm">
      {!isMobile ? (
        <div className="w-full overflow-x-auto scrollbar-hide py-3 sm:py-4">
          <div className="flex gap-1.5 sm:gap-2 min-w-max px-4 sm:px-6">
            {cards}
          </div>
        </div>
      ) : (
        <>
          <AnimatePresence initial={false}>
            {showStories && (
            <motion.div
              key="stories-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="w-full overflow-x-auto scrollbar-hide py-3 sm:py-4">
                <div className="flex gap-1.5 sm:gap-2 min-w-max px-4 sm:px-6">
                  {cards}
                </div>
              </div>
            </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setShowStories(!showStories)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors border-b border-border/50"
          >
            <span className="flex-1 border-t border-border/30" />
            <span className="flex items-center gap-1 shrink-0">
              {showStories ? 'Hide stories' : 'See stories'}
              {showStories ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
            <span className="flex-1 border-t border-border/30" />
          </button>
        </>
      )}

      <CreateStoryDialog open={createOpen} onOpenChange={setCreateOpen} />

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

      <CreateStoryDialog open={createOpen} onOpenChange={setCreateOpen} />

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
    </div>
  );
};

export default Stories;

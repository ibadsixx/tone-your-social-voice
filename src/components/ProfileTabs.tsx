import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { getUserPosts } from '@/hooks/usePosts';
import AboutSection from './AboutSection';
import Post from './Post';
import ScheduledPostsTab from './ScheduledPostsTab';
import FilteredPostsLayout from './FilteredPostsLayout';
import FriendsTab from './FriendsTab';
import Mentions from '@/pages/Mentions';

interface ProfileTabsProps {
  profileId: string;
  isOwnProfile: boolean;
}

const ProfileTabs = ({ profileId, isOwnProfile }: ProfileTabsProps) => {
  const [activeTab, setActiveTab] = useState('posts');
  const { posts, loading: postsLoading } = getUserPosts(profileId);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
      <TabsList className={`w-full grid h-9 md:h-10 ${isOwnProfile ? 'grid-cols-5' : 'grid-cols-3'}`}>
        <TabsTrigger value="posts" className="px-1 md:px-3" aria-label="Posts">
          <span className="md:hidden">P</span>
          <span className="hidden md:inline text-sm">Posts</span>
        </TabsTrigger>
        {isOwnProfile && <TabsTrigger value="scheduled" className="px-1 md:px-3" aria-label="Scheduled">
          <span className="md:hidden">S</span>
          <span className="hidden md:inline text-sm">Scheduled</span>
        </TabsTrigger>}
        {isOwnProfile && <TabsTrigger value="mentions" className="px-1 md:px-3" aria-label="Mentions">
          <span className="md:hidden">@</span>
          <span className="hidden md:inline text-sm">Mentions</span>
        </TabsTrigger>}
        <TabsTrigger value="about" className="px-1 md:px-3" aria-label="About">
          <span className="md:hidden">A</span>
          <span className="hidden md:inline text-sm">About</span>
        </TabsTrigger>
        <TabsTrigger value="friends" className="px-1 md:px-3" aria-label="Friends">
          <span className="md:hidden">F</span>
          <span className="hidden md:inline text-sm">Friends</span>
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="posts" className="mt-6">
        <FilteredPostsLayout 
          posts={posts} 
          loading={postsLoading} 
          isOwnProfile={isOwnProfile} 
        />
      </TabsContent>
      
      {isOwnProfile && (
        <TabsContent value="scheduled" className="mt-6">
          <ScheduledPostsTab />
        </TabsContent>
      )}

      {isOwnProfile && (
        <TabsContent value="mentions" className="mt-6">
          <Mentions />
        </TabsContent>
      )}
      
      <TabsContent value="about" className="mt-6">
        <AboutSection profileId={profileId} isOwnProfile={isOwnProfile} />
      </TabsContent>
      
      <TabsContent value="friends" className="mt-6">
        <FriendsTab profileId={profileId} isOwnProfile={isOwnProfile} />
      </TabsContent>
    </Tabs>
  );
};

export default ProfileTabs;
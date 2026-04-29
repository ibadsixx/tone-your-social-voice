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
      <TabsList className={`grid w-full ${isOwnProfile ? 'grid-cols-5' : 'grid-cols-3'}`}>
        <TabsTrigger value="posts">Posts</TabsTrigger>
        {isOwnProfile && <TabsTrigger value="scheduled">Scheduled</TabsTrigger>}
        {isOwnProfile && <TabsTrigger value="mentions">Mentions</TabsTrigger>}
        <TabsTrigger value="about">About</TabsTrigger>
        <TabsTrigger value="friends">Friends</TabsTrigger>
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
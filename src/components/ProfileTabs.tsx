import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserPosts } from '@/hooks/usePosts';
import AboutSection from './AboutSection';
import Post from './Post';
import ScheduledPostsTab from './ScheduledPostsTab';
import FilteredPostsLayout from './FilteredPostsLayout';
import FriendsTab from './FriendsTab';
import Mentions from '@/pages/Mentions';
import type { ProfileSectionFilter } from '@/lib/profileSections';
import type { AboutSectionId } from '@/lib/profileAbout';

interface ProfileTabsProps {
  profileId: string;
  isOwnProfile: boolean;
  coverPic?: string | null;
  activeFilter?: ProfileSectionFilter;
  onFilterChange?: (filter: ProfileSectionFilter) => void;
  // The selected top-level tab is controlled by the URL (posts/scheduled/
  // mentions/about/friends), so the tabs deep-link, work with browser
  // back/forward and survive a page refresh. When absent the component keeps
  // managing the tab internally.
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  aboutSection?: AboutSectionId;
  onAboutSectionChange?: (section: AboutSectionId) => void;
}

const ProfileTabs = ({
  profileId,
  isOwnProfile,
  coverPic,
  activeFilter,
  onFilterChange,
  activeTab: controlledTab,
  onTabChange,
  aboutSection,
  onAboutSectionChange,
}: ProfileTabsProps) => {
  const [internalTab, setInternalTab] = useState('posts');
  const activeTab = controlledTab ?? internalTab;
  const handleTabChange = (tab: string) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };
  const { posts, loading: postsLoading } = useUserPosts(profileId);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
      <TabsList className={`w-full grid h-9 md:h-10 ${isOwnProfile ? 'grid-cols-5' : 'grid-cols-4'}`}>
        <TabsTrigger value="posts" className="px-1 md:px-3" aria-label="Posts">
          <span className="md:hidden">P</span>
          <span className="hidden md:inline text-sm">Posts</span>
        </TabsTrigger>
        {isOwnProfile && <TabsTrigger value="scheduled" className="px-1 md:px-3" aria-label="Scheduled">
          <span className="md:hidden">S</span>
          <span className="hidden md:inline text-sm">Scheduled</span>
        </TabsTrigger>}
        <TabsTrigger value="mentions" className="px-1 md:px-3" aria-label="Mentions">
          <span className="md:hidden">@</span>
          <span className="hidden md:inline text-sm">Mentions</span>
        </TabsTrigger>
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
          coverPic={coverPic}
          activeFilter={activeFilter}
          onFilterChange={onFilterChange}
        />
      </TabsContent>
      
      {isOwnProfile && (
        <TabsContent value="scheduled" className="mt-6">
          <ScheduledPostsTab profileId={profileId} />
        </TabsContent>
      )}

      <TabsContent value="mentions" className="mt-6">
        <Mentions targetUserId={profileId} />
      </TabsContent>
      
      <TabsContent value="about" className="mt-6">
        <AboutSection
          profileId={profileId}
          isOwnProfile={isOwnProfile}
          activeSection={aboutSection}
          onSectionChange={onAboutSectionChange}
        />
      </TabsContent>
      
      <TabsContent value="friends" className="mt-6">
        <FriendsTab profileId={profileId} isOwnProfile={isOwnProfile} />
      </TabsContent>
    </Tabs>
  );
};

export default ProfileTabs;
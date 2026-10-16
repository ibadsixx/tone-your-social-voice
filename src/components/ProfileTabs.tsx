import { ReactNode, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AboutSection from './AboutSection';
import ScheduledPostsTab from './ScheduledPostsTab';
import FilteredPostsLayout from './FilteredPostsLayout';
import FriendsTab from './FriendsTab';
import Mentions from '@/pages/Mentions';
import { useAuth } from '@/hooks/useAuth';
import type { ProfileSectionFilter } from '@/lib/profileSections';
import type { AboutSectionId } from '@/lib/profileAbout';

/**
 * The tabbed body of a Profile.
 *
 * A Page renders through this SAME component: `profileKind="page"` swaps the
 * tab set (Posts / Mentions / About / Followers) and lets the caller supply the
 * tab bodies (`postsContent`, `aboutContent`, `followersContent`,
 * `mentionsContent`). The personal profile keeps its own tab set and default
 * bodies, so nothing about it changes.
 */
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
  /** 'person' (default) renders the personal-profile tab set. */
  profileKind?: 'person' | 'page';
  /** Page mode: body of the Posts tab. */
  postsContent?: ReactNode;
  /** Page mode: body of the About tab. */
  aboutContent?: ReactNode;
  /** Page mode: body of the Followers tab. */
  followersContent?: ReactNode;
  /** Page mode: body of the Mentions tab (shown to signed-in viewers). */
  mentionsContent?: ReactNode;
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
  profileKind = 'person',
  postsContent,
  aboutContent,
  followersContent,
  mentionsContent,
}: ProfileTabsProps) => {
  const [internalTab, setInternalTab] = useState('posts');
  const activeTab = controlledTab ?? internalTab;
  const handleTabChange = (tab: string) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };
  const { user } = useAuth();

  if (profileKind === 'page') {
    const cols = user ? 'grid-cols-4' : 'grid-cols-3';
    return (
      <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
        <TabsList className={`w-full grid h-9 md:h-10 ${cols}`}>
          <TabsTrigger value="posts" className="px-1 md:px-3" aria-label="Posts">
            <span className="md:hidden">P</span>
            <span className="hidden md:inline text-sm">Posts</span>
          </TabsTrigger>
          {user && (
            <TabsTrigger value="mentions" className="px-1 md:px-3" aria-label="Mentions">
              <span className="md:hidden">@</span>
              <span className="hidden md:inline text-sm">Mentions</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="about" className="px-1 md:px-3" aria-label="About">
            <span className="md:hidden">A</span>
            <span className="hidden md:inline text-sm">About</span>
          </TabsTrigger>
          <TabsTrigger value="followers" className="px-1 md:px-3" aria-label="Followers">
            <span className="md:hidden">F</span>
            <span className="hidden md:inline text-sm">Followers</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-6">
          {postsContent ?? (
            <FilteredPostsLayout
              profileId={profileId}
              coverPic={coverPic}
              activeFilter={activeFilter}
              onFilterChange={onFilterChange}
            />
          )}
        </TabsContent>

        {user && (
          <TabsContent value="mentions" className="mt-6">
            {mentionsContent}
          </TabsContent>
        )}

        <TabsContent value="about" className="mt-6">
          {aboutContent}
        </TabsContent>

        <TabsContent value="followers" className="mt-6">
          {followersContent}
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
      <TabsList className={`w-full grid h-9 md:h-10 ${isOwnProfile ? 'grid-cols-5' : user ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <TabsTrigger value="posts" className="px-1 md:px-3" aria-label="Posts">
          <span className="md:hidden">P</span>
          <span className="hidden md:inline text-sm">Posts</span>
        </TabsTrigger>
        {isOwnProfile && <TabsTrigger value="scheduled" className="px-1 md:px-3" aria-label="Scheduled">
          <span className="md:hidden">S</span>
          <span className="hidden md:inline text-sm">Scheduled</span>
        </TabsTrigger>}
        {user && <TabsTrigger value="mentions" className="px-1 md:px-3" aria-label="Mentions">
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
        {/* No `posts`/`loading` props: each of the four sections now reads its
            own page, one item per request, from the profile content endpoint. */}
        <FilteredPostsLayout
          profileId={profileId}
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

      {user && (
        <TabsContent value="mentions" className="mt-6">
          <Mentions targetUserId={profileId} />
        </TabsContent>
      )}

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

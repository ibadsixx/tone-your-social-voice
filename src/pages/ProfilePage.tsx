import { useState, useEffect } from 'react';
import { useParams, useNavigate, useMatch } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { profilesApi } from '@/api';
import type { Profile } from '@/api/profiles';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ProfileHeader from '@/components/ProfileHeader';
import ProfileTabs from '@/components/ProfileTabs';
import PageContainer from '@/components/PageContainer';
import {
  sectionToFilter,
  profileSectionPath,
  redirectForInvalidSection,
} from '@/lib/profileSections';
import type { ProfileSectionFilter } from '@/lib/profileSections';
import {
  aboutSectionPath,
  slugToAboutSection,
} from '@/lib/profileAbout';
import type { AboutSectionId } from '@/lib/profileAbout';
import {
  sectionToTab,
  profileTabPath,
} from '@/lib/profileTabs';

const ProfilePage = () => {
  const { username, section } = useParams<{ username: string; section?: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (username) {
      fetchProfile();
    }
  }, [username, user]);

  const fetchProfile = async () => {
    if (!username) return;
    
    try {
      let { data, error } = await profilesApi.getProfileByUsername(username);

      // The account may predate profile auto-creation, so it exists in
      // auth.users but has no `profiles` row yet. Look it up and create the
      // row on the fly instead of 404ing.
      if (!error && !data) {
        const authUser = await profilesApi.findAuthUserByUsername(username);
        if (authUser) {
          const created = await profilesApi.ensureProfile({
            id: authUser.id,
            email: authUser.email,
            user_metadata: authUser.raw_user_meta_data,
          });
          if (created?.username) {
            const retried = await profilesApi.getProfileByUsername(created.username);
            data = retried.data;
            error = retried.error;
          }
        }
      }

      if (error) {
        console.error('Profile fetch error:', error);
        navigate('/404');
        return;
      }

      if (!data) {
        navigate('/404');
        return;
      }
      
      setProfile(data);
      setIsOwnProfile(user?.id === data.id);
    } catch (error) {
      console.error('Profile fetch error:', error);
      navigate('/404');
    } finally {
      setLoading(false);
    }
  };

  // The active profile tab is derived from the URL, so deep links, refresh and
  // browser back/forward all stay in sync. Unknown segments are redirected:
  // the removed Videos section goes to Reels, anything else to Posts.
  const activeFilter = sectionToFilter(section);

  useEffect(() => {
    const redirect = redirectForInvalidSection(section);
    if (!profile || !redirect) return;
    navigate(profileSectionPath(profile.username, redirect), { replace: true });
  }, [section, profile, navigate]);

  // Scheduled content is private to the profile owner. A visitor reaching
  // /profile/:username/scheduled is sent back to the Posts feed.
  useEffect(() => {
    if (!profile || section !== 'scheduled' || isOwnProfile) return;
    navigate(profileSectionPath(profile.username, 'all'), { replace: true });
  }, [section, profile, isOwnProfile, navigate]);

  // Mentions are never exposed to logged-out guests (do.md). A guest reaching
  // /profile/:username/mentions directly is sent back to the Posts feed,
  // mirroring the scheduled-section redirect. Authenticated viewers keep the
  // existing Mentions behavior.
  useEffect(() => {
    if (!profile || section !== 'mentions' || user) return;
    navigate(profileSectionPath(profile.username, 'all'), { replace: true });
  }, [section, profile, user, navigate]);

  const handleFilterChange = (filter: ProfileSectionFilter) => {
    if (!profile) return;
    navigate(profileSectionPath(profile.username, filter));
  };

  // The About tab and its subsections are also URL-driven, so they deep-link
  // and support back/forward while the profile shell stays mounted.
  const aboutBaseMatch = useMatch('/profile/:username/about');
  const aboutSubMatch = useMatch('/profile/:username/about/:aboutSection');
  const isAboutRoute = Boolean(aboutBaseMatch || aboutSubMatch);
  const aboutSlug = aboutSubMatch?.params.aboutSection;
  const resolvedAboutSection = aboutSlug ? slugToAboutSection(aboutSlug) : 'overview';
  const activeAboutSection: AboutSectionId | undefined = isAboutRoute
    ? resolvedAboutSection ?? 'overview'
    : undefined;

  // The active profile tab is derived from the URL, so deep links, refresh and
  // browser back/forward all stay in sync.
  const activeTab: string = isAboutRoute ? 'about' : sectionToTab(section);

  useEffect(() => {
    if (!profile || !aboutSubMatch || !aboutSlug) return;
    if (slugToAboutSection(aboutSlug)) return;
    navigate(aboutSectionPath(profile.username, 'overview'), { replace: true });
  }, [aboutSubMatch, aboutSlug, profile, navigate]);

  const handleTabChange = (tab: string) => {
    if (!profile) return;
    if (tab === 'about') {
      navigate(aboutSectionPath(profile.username, 'overview'));
    } else if (tab === 'scheduled' || tab === 'mentions' || tab === 'friends') {
      navigate(profileTabPath(profile.username, tab));
    } else if (tab === 'posts') {
      navigate(profileSectionPath(profile.username, activeFilter));
    }
  };

  const handleAboutSectionChange = (sectionId: AboutSectionId) => {
    if (!profile) return;
    navigate(aboutSectionPath(profile.username, sectionId));
  };

  if (loading) {
    return (
      <PageContainer size="md">
        <div className="text-center">Loading profile...</div>
      </PageContainer>
    );
  }
  if (!profile) {
    // This shouldn't render since we navigate to /404, but just in case
    navigate('/404');
    return null;
  }

  return (
    <PageContainer size="md" className="space-y-4 md:space-y-6">
      {/* Back Button */}
      {!isOwnProfile && (
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      )}

      {/* Profile Header */}
      <Card className="overflow-hidden">
        <ProfileHeader
          profile={profile}
          isOwnProfile={isOwnProfile}
          onProfileUpdate={fetchProfile}
        />
      </Card>

      {/* Profile Tabs */}
      <ProfileTabs
        profileId={profile.id}
        isOwnProfile={isOwnProfile}
        coverPic={profile.cover_pic}
        activeFilter={activeFilter}
        onFilterChange={handleFilterChange}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        aboutSection={activeAboutSection}
        onAboutSectionChange={handleAboutSectionChange}
      />
    </PageContainer>
  );
};

export default ProfilePage;
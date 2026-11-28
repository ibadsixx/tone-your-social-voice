import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useMatch } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { profilesApi } from '@/api';
import type { PublicProfile } from '@/api/profiles';
import { Card } from '@/components/ui/card';
import ProfileHeader from '@/components/ProfileHeader';
import ProfileTabs from '@/components/ProfileTabs';
import PageContainer from '@/components/PageContainer';
import ProfileLoadFailureNotice from '@/components/profile/ProfileLoadFailureNotice';
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
import { parseProfileRouteIdentifier } from '@/lib/profileRoute';
import {
  classifyProfileLoadFailure,
  describeProfileLoadFailure,
} from '@/lib/profileLoadFailure';
import type { ProfileLoadFailure, ProfileLoadErrorLike } from '@/lib/profileLoadFailure';
import { getCurrentAccessToken } from '@/lib/supabase/sessionTokenProvider';
import { useProfileSeo } from '@/hooks/useProfileSeo';

const ProfilePage = () => {
  const { username, section } = useParams<{ username: string; section?: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ProfileLoadFailure | null>(null);
  const requestIdRef = useRef(0);

  // The owner's "Permit search engines beyond Tone to reference your profile?"
  // answer decides whether this page may be indexed. This is also what puts a
  // per-profile canonical on the page, which the app's index.html otherwise
  // leaves pointing at "/" for every route.
  useProfileSeo(username, profile);

  const fail = (error: ProfileLoadErrorLike | ProfileLoadFailure) => {
    const classified = 'kind' in error ? error : classifyProfileLoadFailure(error);
    console.warn(describeProfileLoadFailure(classified));
    setProfile(null);
    setIsOwnProfile(false);
    setFailure(classified);
  };

  const fetchProfile = async () => {
    // Central Auth is initialized asynchronously. Issuing the profile read
    // while `user` is still null makes a signed-in viewer look like a guest;
    // a readable empty result would then become a false 404 before auth can
    // resolve. Wait for auth, then run exactly one lookup.
    if (authLoading) return;

    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    setLoading(true);
    setFailure(null);

    // A bad :identifier segment is a route parsing problem. It must never issue
    // a doomed query and then report "profile not found".
    const routeId = parseProfileRouteIdentifier(username);
    if (routeId.kind === 'invalid') {
      fail(classifyProfileLoadFailure({ code: 'INVALID_ROUTE' }));
      setLoading(false);
      return;
    }

    try {
      // An id-shaped URL addresses the `id` column. Querying `username=eq.<id>`
      // used to find nothing and produce the reported fake 404.
      if (routeId.kind === 'id') {
        const byId = await profilesApi.getProfileById(routeId.id);
        if (!isCurrent()) return;
        if (byId.error) {
          fail(byId.error);
          return;
        }
        if (!byId.data) {
          // An absent JWT makes a signed-in viewer look anonymous to RLS; that
          // is a session failure, not proof that the profile does not exist.
          if (user && !(await getCurrentAccessToken())) {
            if (!isCurrent()) return;
            fail(classifyProfileLoadFailure({ code: 'NO_SESSION' }));
            return;
          }
          navigate('/404');
          return;
        }
        setProfile(byId.data);
        setIsOwnProfile(user?.id === byId.data.id);
        return;
      }

      let { data, error } = await profilesApi.getProfileByUsername(routeId.username);
      if (!isCurrent()) return;

      if (error) {
        // Registry/route failures, auth failures and RLS errors land here.
        // None of them is evidence that the username is unknown.
        fail(error);
        return;
      }

      if (!data && user) {
        // Only a verified central Auth session may look up or create a profile
        // row. Without a propagated JWT the query ran as an anonymous viewer;
        // treating its empty result as "missing" would hide a session failure.
        if (!(await getCurrentAccessToken())) {
          if (!isCurrent()) return;
          fail(classifyProfileLoadFailure({ code: 'NO_SESSION' }));
          return;
        }

        const authResult = await profilesApi.findAuthUserByUsernameResult(routeId.username);
        if (!isCurrent()) return;
        if (authResult.error) {
          fail(authResult.error);
          return;
        }

        const authUser = authResult.data;
        if (authUser) {
          const created = await profilesApi.ensureProfile({
            id: authUser.id,
            email: authUser.email,
            user_metadata: authUser.raw_user_meta_data,
          });
          if (!isCurrent()) return;
          if (!created?.username) {
            // `null` here means the profile could not be verified or created.
            // It is a load failure, never evidence that the username is absent.
            fail(classifyProfileLoadFailure({ code: 'PROFILE_CREATE_FAILED' }));
            return;
          }

          const retried = await profilesApi.getProfileByUsername(created.username);
          if (!isCurrent()) return;
          data = retried.data;
          error = retried.error;
        }
      }

      if (error) {
        fail(error);
        return;
      }

      // An empty readable result is the only genuine missing-profile case.
      if (!data) {
        if (!isCurrent()) return;
        navigate('/404');
        return;
      }

      setProfile(data);
      setIsOwnProfile(user?.id === data.id);
    } catch (caught) {
      if (!isCurrent()) return;
      const errorLike: ProfileLoadErrorLike =
        caught instanceof Error ? { message: caught.message } : { message: 'unknown error' };
      fail(errorLike);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProfile();
  }, [username, user?.id, authLoading]);

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
  if (failure) return <ProfileLoadFailureNotice failure={failure} onRetry={() => { void fetchProfile(); }} />;
  if (!profile) {
    // Navigation to /404 happens only for a readable but empty lookup.
    return null;
  }

  return (
    <PageContainer size="md" className="space-y-4 md:space-y-6">
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
        profilePic={profile.profile_pic}
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

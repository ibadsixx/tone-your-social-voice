import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

const ProfilePage = () => {
  const { username } = useParams<{ username: string }>();
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
      <ProfileTabs profileId={profile.id} isOwnProfile={isOwnProfile} coverPic={profile.cover_pic} />
    </PageContainer>
  );
};

export default ProfilePage;
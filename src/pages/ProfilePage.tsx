import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ProfileHeader from '@/components/ProfileHeader';
import ProfileTabs from '@/components/ProfileTabs';
import PageContainer from '@/components/PageContainer';


interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  profile_pic: string | null;
  cover_pic: string | null;
  cover_position_y?: number;
  created_at: string;
  about_you?: string;
  about_you_visibility?: string;
  name_pronunciation?: string;
  name_pronunciation_visibility?: string;
}

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
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (error) {
        console.error('Profile fetch error:', error);
        // Navigate to 404 for any error
        navigate('/404');
        return;
      }

      if (!data) {
        // Profile not found or blocked (RLS filtered out)
        navigate('/404');
        return;
      }
      
      setProfile(data);
      setIsOwnProfile(user?.id === data.id);
    } catch (error: any) {
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
      <ProfileTabs profileId={profile.id} isOwnProfile={isOwnProfile} />
    </PageContainer>
  );
};

export default ProfilePage;
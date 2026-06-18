import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import PageContainer from '@/components/PageContainer';

// This component now redirects to the dynamic profile page
const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If user is logged in, fetch their profile and redirect to /profile/:username
    if (user) {
      const fetchUserProfile = async () => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', user.id)
            .single();

          if (error) throw error;
          
          if (data?.username) {
            navigate(`/profile/${data.username}`, { replace: true });
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          navigate('/', { replace: true });
        }
      };

      fetchUserProfile();
    }
  }, [user, navigate]);

  return (
    <PageContainer size="sm">
      <div className="text-center">Loading profile...</div>
    </PageContainer>
  );
};

export default Profile;
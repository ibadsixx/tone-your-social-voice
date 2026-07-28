import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { profilesApi } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { validateProfileVisibility, sanitizeProfilePayload } from '@/utils/profileValidation';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  cover_pic: string | null;
  bio: string | null;
  email: string | null;
  friends_visibility?: string | null;
  following_visibility?: boolean | null;
  privacy?: string | null;
  birthday: string | null;
  relationship: string | null;
  about_you?: string | null;
  about_you_visibility?: string | null;
  name_pronunciation?: string | null;
  name_pronunciation_visibility?: string | null;
  created_at: string;
  updated_at: string;
}

export const useProfile = (profileId?: string) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const userId = profileId || user?.id;

  const fetchProfile = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await profilesApi.getProfileById(userId);

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  // Set up real-time subscription for profile changes (only for own profile)
  useEffect(() => {
    if (!user?.id || profileId) return; // Only subscribe to own profile changes

    const channel = gateway
      .channel('profile-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setProfile(payload.new as Profile);
          }
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [user?.id, profileId]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user?.id) throw new Error('User not authenticated');
    
    try {
      // Sanitize and validate the payload
      const sanitizedPayload = sanitizeProfilePayload(updates);
      validateProfileVisibility(sanitizedPayload);
      
      const { error } = await profilesApi.updateProfile(user.id, sanitizedPayload as any);

      if (error) {
        console.error('Profile update error:', error);
        throw error;
      }
      
      await fetchProfile(); // Refresh profile data
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  return {
    profile,
    loading,
    refetch: fetchProfile,
    updateProfile,
  };
};
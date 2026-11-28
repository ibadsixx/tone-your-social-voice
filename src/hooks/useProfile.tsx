import { useState, useEffect } from 'react';
import { dataClient } from '@/lib/supabase/dataClient';
import { profilesApi } from '@/api';
import type { PublicProfile } from '@/api/profiles';
import { useAuth } from '@/hooks/useAuth';
import { validateProfileVisibility, sanitizeProfilePayload } from '@/utils/profileValidation';

/**
 * Phase 3G-N: this hook is a PUBLIC profile read boundary. It deliberately
 * exposes only the six approved columns. Private owner-only values require the
 * future approved secure owner-only read function and must not be inferred
 * from this object. Writes remain allowed through the existing owner-scoped
 * API; they do not widen this read contract.
 */
type ProfileUpdate = Record<string, unknown>;

export const useProfile = (profileId?: string) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
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

      // `getProfileById` already selects exactly the six public columns.
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

    const channel = dataClient
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
            // Do not copy payload.new into state: a broad role could include
            // private columns. Re-read through the public projection instead.
            void fetchProfile();
          }
        }
      )
      .subscribe();

    const handleProfileUpdated = () => {
      fetchProfile();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('profile:updated', handleProfileUpdated);
    }

    return () => {
      dataClient.removeChannel(channel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('profile:updated', handleProfileUpdated);
      }
    };
  }, [user?.id, profileId]);

  const updateProfile = async (updates: ProfileUpdate) => {
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
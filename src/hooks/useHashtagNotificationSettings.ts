import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export const useHashtagNotificationSettings = () => {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await gateway
          .from('privacy_settings')
          .select('setting_value')
          .eq('user_id', user.id)
          .eq('setting_name', 'hashtag_notifications')
          .maybeSingle();

        setEnabled(data?.setting_value !== 'false');
      } catch (error) {
        console.error('Error loading hashtag notification settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [user]);

  const toggleNotifications = async () => {
    if (!user) return;

    try {
      const newValue = !enabled;
      
      const { error } = await gateway
        .from('privacy_settings')
        .upsert({
          user_id: user.id,
          setting_name: 'hashtag_notifications',
          setting_value: newValue ? 'true' : 'false',
        }, {
          onConflict: 'user_id,setting_name'
        });

      if (error) throw error;

      setEnabled(newValue);
      toast.success(
        newValue 
          ? 'Hashtag notifications enabled' 
          : 'Hashtag notifications disabled'
      );
    } catch (error) {
      console.error('Error updating hashtag notification settings:', error);
      toast.error('Failed to update notification settings');
    }
  };

  return { enabled, loading, toggleNotifications };
};

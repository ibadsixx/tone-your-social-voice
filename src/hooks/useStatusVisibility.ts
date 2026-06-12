import { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { setNotificationSoundEnabled, setDoNotDisturbUntil } from '@/lib/notificationSounds';

interface StatusPerson {
  id: string;
  display_name: string;
  username: string;
  profile_pic?: string | null;
}

function isDoNotDisturbActive(dndUntil: string | null): boolean {
  if (!dndUntil) return false;
  return Date.now() < new Date(dndUntil).getTime();
}

function formatDoNotDisturbEnd(dndUntil: string | null): string {
  if (!dndUntil) return 'Off';
  const end = new Date(dndUntil);
  if (Date.now() >= end.getTime()) return 'Off';
  const diffMs = end.getTime() - Date.now();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours < 24) return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  return end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export type DndDuration = '1h' | '2h' | '4h' | 'tomorrow' | 'forever' | 'off';

export function useStatusVisibility() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const [visibleTo, setVisibleTo] = useState<StatusPerson[]>([]);
  const [hiddenFrom, setHiddenFrom] = useState<StatusPerson[]>([]);
  const [manualStatus, setManualStatusState] = useState<'online' | 'offline' | null>(null);
  const [notificationSounds, setNotificationSoundsState] = useState(true);
  const [doNotDisturbUntil, setDoNotDisturbUntilState] = useState<string | null>(null);
  const [darkMode, setDarkModeState] = useState(false);
  const [showReadIndicator, setShowReadIndicatorState] = useState(true);
  const [checkKeysInConversations, setCheckKeysInConversationsState] = useState(false);
  const [rememberBrowser, setRememberBrowserState] = useState(false);
  const [disableAutoUploads, setDisableAutoUploadsState] = useState(false);
  const [previewMode, setPreviewModeState] = useState(false);
  const [vaultPin, setVaultPinState] = useState<string | null>(null);
  const [vaultRecoveryCode, setVaultRecoveryCodeState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatusData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [profileRes, visibleRes, hiddenRes] = await Promise.all([
        supabase.from('profiles').select('manual_status, notification_sounds, do_not_disturb_until, dark_mode, show_read_indicator, check_keys_in_conversations, remember_browser, disable_auto_uploads, vault_pin, vault_recovery_code, preview_mode').eq('id', user.id).single(),
        supabase
          .from('status_visibility')
          .select('target_user_id, profiles!status_visibility_target_user_id_fkey(id, display_name, username, profile_pic)')
          .eq('user_id', user.id)
          .eq('visibility', 'visible'),
        supabase
          .from('status_visibility')
          .select('target_user_id, profiles!status_visibility_target_user_id_fkey(id, display_name, username, profile_pic)')
          .eq('user_id', user.id)
          .eq('visibility', 'hidden'),
      ]);

      if (profileRes.data) {
        setManualStatusState(profileRes.data.manual_status);
        setNotificationSoundsState(profileRes.data.notification_sounds ?? true);
        const dndUntil = profileRes.data.do_not_disturb_until;
        setDoNotDisturbUntilState(dndUntil);
        setNotificationSoundEnabled(profileRes.data.notification_sounds ?? true);
        setDoNotDisturbUntil(dndUntil);
        const dbDarkMode = profileRes.data.dark_mode ?? false;
        setDarkModeState(dbDarkMode);
        setTheme(dbDarkMode ? 'dark' : 'light');
        setShowReadIndicatorState(profileRes.data.show_read_indicator ?? true);
        setCheckKeysInConversationsState(profileRes.data.check_keys_in_conversations ?? false);
        setRememberBrowserState(profileRes.data.remember_browser ?? false);
        setDisableAutoUploadsState(profileRes.data.disable_auto_uploads ?? false);
        setPreviewModeState(profileRes.data.preview_mode ?? false);
        setVaultPinState(profileRes.data.vault_pin ?? null);
        setVaultRecoveryCodeState(profileRes.data.vault_recovery_code ?? null);
      }

      if (visibleRes.data) {
        setVisibleTo(
          visibleRes.data.map((r: any) => ({
            id: r.target_user_id,
            display_name: r.profiles?.display_name || 'Unknown',
            username: r.profiles?.username || 'unknown',
            profile_pic: r.profiles?.profile_pic,
          }))
        );
      }

      if (hiddenRes.data) {
        setHiddenFrom(
          hiddenRes.data.map((r: any) => ({
            id: r.target_user_id,
            display_name: r.profiles?.display_name || 'Unknown',
            username: r.profiles?.username || 'unknown',
            profile_pic: r.profiles?.profile_pic,
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching status visibility:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchStatusData();
  }, [fetchStatusData]);

  const setManualStatus = async (status: 'online' | 'offline' | null) => {
    setManualStatusState(status);
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ manual_status: status })
      .eq('id', user.id);
  };

  const addVisibilityOverride = async (targetUserId: string, visibility: 'visible' | 'hidden') => {
    if (!user?.id) return;
    await supabase
      .from('status_visibility')
      .upsert(
        { user_id: user.id, target_user_id: targetUserId, visibility },
        { onConflict: 'user_id, target_user_id' }
      );
    await fetchStatusData();
  };

  const removeVisibilityOverride = async (targetUserId: string) => {
    if (!user?.id) return;
    await supabase
      .from('status_visibility')
      .delete()
      .eq('user_id', user.id)
      .eq('target_user_id', targetUserId);
    await fetchStatusData();
  };

  const setNotificationSounds = async (value: boolean) => {
    setNotificationSoundsState(value);
    setNotificationSoundEnabled(value);
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ notification_sounds: value })
      .eq('id', user.id);
  };

  const setDoNotDisturbDuration = async (duration: DndDuration) => {
    let until: string | null = null;
    const now = Date.now();
    switch (duration) {
      case '1h':
        until = new Date(now + 60 * 60 * 1000).toISOString();
        break;
      case '2h':
        until = new Date(now + 2 * 60 * 60 * 1000).toISOString();
        break;
      case '4h':
        until = new Date(now + 4 * 60 * 60 * 1000).toISOString();
        break;
      case 'tomorrow': {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        until = tomorrow.toISOString();
        break;
      }
      case 'forever':
        until = new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'off':
        until = null;
        break;
    }
    setDoNotDisturbUntilState(until);
    setDoNotDisturbUntil(until);
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ do_not_disturb_until: until })
      .eq('id', user.id);
  };

  const setDarkMode = async (value: boolean) => {
    setDarkModeState(value);
    setTheme(value ? 'dark' : 'light');
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ dark_mode: value })
      .eq('id', user.id);
  };

  const setShowReadIndicator = async (value: boolean) => {
    setShowReadIndicatorState(value);
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ show_read_indicator: value })
      .eq('id', user.id);
  };

  const setCheckKeysInConversations = async (value: boolean) => {
    setCheckKeysInConversationsState(value);
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ check_keys_in_conversations: value })
      .eq('id', user.id);
  };

  const setRememberBrowser = async (value: boolean) => {
    setRememberBrowserState(value);
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ remember_browser: value })
      .eq('id', user.id);
  };

  const setDisableAutoUploads = async (value: boolean) => {
    setDisableAutoUploadsState(value);
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ disable_auto_uploads: value })
      .eq('id', user.id);
  };

  const setPreviewMode = async (value: boolean) => {
    setPreviewModeState(value);
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ preview_mode: value })
      .eq('id', user.id);
  };

  const setVaultPin = async (pin: string | null) => {
    setVaultPinState(pin);
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ vault_pin: pin })
      .eq('id', user.id);
  };

  const setVaultRecoveryCode = async (code: string | null) => {
    setVaultRecoveryCodeState(code);
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ vault_recovery_code: code })
      .eq('id', user.id);
  };

  const doNotDisturb = isDoNotDisturbActive(doNotDisturbUntil);
  const doNotDisturbLabel = doNotDisturb ? `Until ${formatDoNotDisturbEnd(doNotDisturbUntil)}` : 'Off';

  return {
    visibleTo,
    hiddenFrom,
    manualStatus,
    notificationSounds,
    doNotDisturb,
    doNotDisturbUntil,
    doNotDisturbLabel,
    darkMode,
    showReadIndicator,
    checkKeysInConversations,
    rememberBrowser,
    disableAutoUploads,
    previewMode,
    vaultPin,
    vaultRecoveryCode,
    setManualStatus,
    setNotificationSounds,
    setDoNotDisturbDuration,
    setDarkMode,
    setShowReadIndicator,
    setCheckKeysInConversations,
    setRememberBrowser,
    setDisableAutoUploads,
    setPreviewMode,
    setVaultPin,
    setVaultRecoveryCode,
    addVisibilityOverride,
    removeVisibilityOverride,
    loading,
    refetch: fetchStatusData,
  };
}

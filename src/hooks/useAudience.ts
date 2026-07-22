import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import type { AudienceSelection } from '@/components/AudienceSelector';

interface AudienceList {
  id: string;
  name: string;
  member_ids: string[];
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export const useAudience = () => {
  const { user } = useAuth();
  const [audienceLists, setAudienceLists] = useState<AudienceList[]>([]);
  const [loading, setLoading] = useState(false);

  // Load user's custom audience lists
  const loadAudienceLists = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await gateway
        .from('audience_lists')
        .select('*')
        .eq('owner_id', user.id)
        .order('name');
      
      if (error) throw error;
      setAudienceLists(data || []);
    } catch (error) {
      console.error('Error loading audience lists:', error);
    } finally {
      setLoading(false);
    }
  };

  // Create a new audience list
  const createAudienceList = async (name: string, memberIds: string[]) => {
    if (!user) return null;
    
    try {
      const { data, error } = await gateway
        .from('audience_lists')
        .insert({
          owner_id: user.id,
          name: name.trim(),
          member_ids: memberIds
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setAudienceLists(prev => [...prev, data]);
      return data;
    } catch (error) {
      console.error('Error creating audience list:', error);
      return null;
    }
  };

  // Update an existing audience list
  const updateAudienceList = async (listId: string, updates: Partial<Pick<AudienceList, 'name' | 'member_ids'>>) => {
    try {
      const { data, error } = await gateway
        .from('audience_lists')
        .update(updates)
        .eq('id', listId)
        .eq('owner_id', user?.id)
        .select()
        .single();
      
      if (error) throw error;
      
      setAudienceLists(prev => 
        prev.map(list => list.id === listId ? data : list)
      );
      return data;
    } catch (error) {
      console.error('Error updating audience list:', error);
      return null;
    }
  };

  // Delete an audience list
  const deleteAudienceList = async (listId: string) => {
    try {
      const { error } = await gateway
        .from('audience_lists')
        .delete()
        .eq('id', listId)
        .eq('owner_id', user?.id);
      
      if (error) throw error;
      
      setAudienceLists(prev => prev.filter(list => list.id !== listId));
      return true;
    } catch (error) {
      console.error('Error deleting audience list:', error);
      return false;
    }
  };

  // Convert audience selection to database format
  const audienceToDbFormat = (audience: AudienceSelection) => {
    return {
      audience_type: audience.type,
      audience_user_ids: audience.userIds || null,
      audience_excluded_user_ids: audience.excludedUserIds || null,
      audience_list_id: audience.customListId || null
    };
  };

  // Convert database format to audience selection
  const dbToAudienceFormat = (dbData: any): AudienceSelection => {
    return {
      type: dbData.audience_type || 'public',
      userIds: dbData.audience_user_ids || undefined,
      excludedUserIds: dbData.audience_excluded_user_ids || undefined,
      customListId: dbData.audience_list_id || undefined
    };
  };

  // Get human-readable audience description
  const getAudienceDescription = (audience: AudienceSelection, friendCount?: number) => {
    switch (audience.type) {
      case 'public':
        return 'Anyone on Tone';
      case 'friends':
        return `Your friends${friendCount ? ` (${friendCount})` : ''}`;
      case 'friends_except':
        const excludedCount = audience.excludedUserIds?.length || 0;
        return `Friends except ${excludedCount} ${excludedCount === 1 ? 'person' : 'people'}`;
      case 'specific':
        const specificCount = audience.userIds?.length || 0;
        return `${specificCount} specific ${specificCount === 1 ? 'friend' : 'friends'}`;
      case 'only_me':
        return 'Only you';
      case 'custom_list':
        const list = audienceLists.find(l => l.id === audience.customListId);
        return list ? `${list.name} (${list.member_ids.length})` : 'Custom list';
      default:
        return 'Unknown audience';
    }
  };

  useEffect(() => {
    if (user) {
      loadAudienceLists();
    }
  }, [user]);

  return {
    audienceLists,
    loading,
    loadAudienceLists,
    createAudienceList,
    updateAudienceList,
    deleteAudienceList,
    audienceToDbFormat,
    dbToAudienceFormat,
    getAudienceDescription
  };
};
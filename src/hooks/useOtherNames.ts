import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface OtherName {
  id: string;
  user_id: string;
  type: string;
  name: string;
  show_at_top: boolean;
  visibility: string;
  created_at: string;
  updated_at: string;
}

export const useOtherNames = (userId?: string) => {
  const [otherNames, setOtherNames] = useState<OtherName[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  // Other Names on a profile are fetched for everyone, including guests: the
  // gateway serves only rows the owner marked visibility='public' to a
  // logged-out visitor (do.md: guests see ALL public profile info), so the
  // fetch is safe and no longer 403s. The realtime subscription below stays
  // authenticated-only — live edits are pointless for a guest viewer.
  const fetchOtherNames = async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await gateway
        .from('other_names')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOtherNames(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load other names',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const createOtherName = async (otherName: Omit<OtherName, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await gateway
        .from('other_names')
        .insert([otherName])
        .select()
        .single();

      if (error) throw error;
      
      setOtherNames(prev => [data, ...prev]);
      toast({
        title: 'Success',
        description: 'Other name added successfully'
      });
      return { success: true, data };
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add other name',
        variant: 'destructive'
      });
      return { success: false, error };
    }
  };

  const updateOtherName = async (id: string, updates: Partial<Omit<OtherName, 'id' | 'created_at' | 'updated_at'>>) => {
    try {
      const { data, error } = await gateway
        .from('other_names')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      setOtherNames(prev => prev.map(item => item.id === id ? data : item));
      toast({
        title: 'Success',
        description: 'Other name updated successfully'
      });
      return { success: true, data };
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update other name',
        variant: 'destructive'
      });
      return { success: false, error };
    }
  };

  const deleteOtherName = async (id: string) => {
    try {
      const { error } = await gateway
        .from('other_names')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setOtherNames(prev => prev.filter(item => item.id !== id));
      toast({
        title: 'Success',
        description: 'Other name deleted successfully'
      });
      return { success: true };
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete other name',
        variant: 'destructive'
      });
      return { success: false, error };
    }
  };

  useEffect(() => {
    if (!userId) {
      setOtherNames([]);
      setLoading(false);
      return;
    }
    fetchOtherNames();
  }, [userId]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user || !userId) return;

    const channel = gateway
      .channel('other-names-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'other_names',
          filter: `user_id=eq.${userId}`
        },
        () => {
          fetchOtherNames();
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [userId, user]);

  return {
    otherNames,
    loading,
    createOtherName,
    updateOtherName,
    deleteOtherName,
    refetch: fetchOtherNames
  };
};
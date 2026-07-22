import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import type { Visibility } from '@/components/VisibilitySelector';

export interface LifeEvent {
  id: string;
  user_id: string;
  category: string;
  title: string;
  extra_info?: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
}

export interface LifeEventInput {
  category: string;
  title: string;
  extra_info?: string;
  visibility: Visibility;
}

const LIFE_EVENT_CATEGORIES = [
  'Work & Education',
  'Family & Relationships',
  'Travel & Living',
  'Health & Wellness',
  'Milestones & Achievements'
] as const;

export type LifeEventCategory = typeof LIFE_EVENT_CATEGORIES[number];

export { LIFE_EVENT_CATEGORIES };

export const useLifeEvents = (userId?: string) => {
  const [lifeEvents, setLifeEvents] = useState<LifeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (userId) {
      fetchLifeEvents();
    }
  }, [userId]);

  const fetchLifeEvents = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const { data, error } = await gateway
        .from('life_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to ensure proper typing
      const transformedData: LifeEvent[] = (data || []).map(event => ({
        ...event,
        visibility: event.visibility as Visibility
      }));
      
      setLifeEvents(transformedData);
    } catch (error: any) {
      console.error('Error fetching life events:', error);
      toast({
        title: 'Error',
        description: 'Failed to load life events',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const createLifeEvent = async (eventData: LifeEventInput): Promise<boolean> => {
    if (!userId) return false;

    try {
      const { error } = await gateway
        .from('life_events')
        .insert({
          user_id: userId,
          ...eventData
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Life event added successfully'
      });
      
      await fetchLifeEvents();
      return true;
    } catch (error: any) {
      console.error('Error creating life event:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add life event',
        variant: 'destructive'
      });
      return false;
    }
  };

  const updateLifeEvent = async (id: string, eventData: Partial<LifeEventInput>): Promise<boolean> => {
    try {
      const { error } = await gateway
        .from('life_events')
        .update({
          ...eventData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Life event updated successfully'
      });
      
      await fetchLifeEvents();
      return true;
    } catch (error: any) {
      console.error('Error updating life event:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update life event',
        variant: 'destructive'
      });
      return false;
    }
  };

  const deleteLifeEvent = async (id: string): Promise<boolean> => {
    try {
      const { error } = await gateway
        .from('life_events')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Life event deleted successfully'
      });
      
      await fetchLifeEvents();
      return true;
    } catch (error: any) {
      console.error('Error deleting life event:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete life event',
        variant: 'destructive'
      });
      return false;
    }
  };

  const getEventsByCategory = () => {
    const grouped = lifeEvents.reduce((acc, event) => {
      if (!acc[event.category]) {
        acc[event.category] = [];
      }
      acc[event.category].push(event);
      return acc;
    }, {} as Record<string, LifeEvent[]>);

    return grouped;
  };

  return {
    lifeEvents,
    loading,
    createLifeEvent,
    updateLifeEvent,
    deleteLifeEvent,
    getEventsByCategory,
    refreshEvents: fetchLifeEvents
  };
};
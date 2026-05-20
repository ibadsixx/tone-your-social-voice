import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface Page {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  cover_image: string | null;
  profile_pic?: string | null;
  created_at: string;
  admin_id: string;
  follower_count?: number;
  is_following?: boolean;
  user_role?: 'follower' | 'admin' | 'editor';
  followed_at?: string;
  engagement_score?: number;
  archived?: boolean;
}

export const usePages = () => {
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchPages = async (type: 'suggested' | 'interactive' | 'new' | 'following' | 'owned') => {
    try {
      setLoading(true);
      let query = supabase
        .from('pages')
        .select(`
          *,
          page_followers (
            user_id,
            role,
            followed_at
          )
        `);

      switch (type) {
        case 'suggested':
          query = query.order('created_at', { ascending: false });
          break;
        case 'interactive':
          query = query.order('created_at', { ascending: false });
          break;
        case 'new':
          query = query.order('created_at', { ascending: false });
          break;
        case 'following':
          if (!user) return [];
          break;
        case 'owned':
          if (!user) return [];
          query = query.eq('admin_id', user.id);
          break;
      }

      const { data, error } = await query;

      if (error) throw error;

      const pagesWithFollowerInfo = data?.map(page => {
        const followerCount = page.page_followers?.length || 0;
        const userFollowing = user ? page.page_followers?.find(f => f.user_id === user.id) : null;
        
        return {
          id: page.id,
          name: page.name,
          description: page.description,
          category: page.category,
          cover_image: page.cover_image,
          profile_pic: page.profile_pic,
          created_at: page.created_at,
          admin_id: page.admin_id,
          follower_count: followerCount,
          is_following: !!userFollowing,
          user_role: userFollowing?.role,
          followed_at: userFollowing?.followed_at
        };
      }) || [];

      // Filter for specific types
      if (type === 'suggested') {
        return pagesWithFollowerInfo.filter(p => !p.is_following);
      } else if (type === 'following') {
        return pagesWithFollowerInfo.filter(p => p.is_following);
      }

      return pagesWithFollowerInfo;
    } catch (error: any) {
      console.error('[usePages] Failed to load pages:', error?.message || error);
      toast({
        title: 'Error',
        description: 'Failed to load pages',
        variant: 'destructive'
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const followPage = async (pageId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('page_followers')
        .insert({ page_id: pageId, user_id: user.id, role: 'follower' });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Page followed successfully!'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to follow page',
        variant: 'destructive'
      });
    }
  };

  const unfollowPage = async (pageId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('page_followers')
        .delete()
        .eq('page_id', pageId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Page unfollowed successfully!'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to unfollow page',
        variant: 'destructive'
      });
    }
  };

  const createPage = async (name: string, description: string, category?: string) => {
    if (!user) return;

    try {
      const { data: newPage, error: createError } = await supabase
        .from('pages')
        .insert({ 
          name, 
          description, 
          category,
          admin_id: user.id 
        })
        .select()
        .single();

      if (createError) throw createError;

      // Auto-follow the created page as admin
      const { error: followError } = await supabase
        .from('page_followers')
        .insert({ page_id: newPage.id, user_id: user.id, role: 'admin' });

      if (followError) throw followError;

      toast({
        title: 'Success',
        description: 'Page created successfully!'
      });

      return newPage;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to create page',
        variant: 'destructive'
      });
    }
  };

  return {
    loading,
    fetchPages,
    followPage,
    unfollowPage,
    createPage
  };
};
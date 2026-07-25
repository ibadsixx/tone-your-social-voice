import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
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

      const pagesRes = await gateway.from('pages').select('*');
      if (pagesRes.error) throw pagesRes.error;

      let allFollowers: any[] = [];
      if (user) {
        const followersRes = await gateway.from('page_followers').select('*').eq('user_id', user.id);
        allFollowers = (followersRes.data as any[]) || [];
      }

      const pagesWithFollowerInfo = (pagesRes.data as any[])?.map(page => {
        const userFollowing = user ? allFollowers.find(f => f.page_id === page.id) : null;

        return {
          id: page.id,
          name: page.name,
          description: page.description,
          category: page.category,
          cover_image: page.cover_image,
          profile_pic: page.profile_pic,
          created_at: page.created_at,
          admin_id: page.admin_id,
          follower_count: page.follower_count ?? 0,
          is_following: !!userFollowing,
          user_role: userFollowing?.role,
          followed_at: userFollowing?.followed_at
        };
      }) || [];

      pagesWithFollowerInfo.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (type === 'suggested') {
        return pagesWithFollowerInfo.filter(p => !p.is_following);
      } else if (type === 'following') {
        if (!user) return [];
        return pagesWithFollowerInfo.filter(p => p.is_following);
      } else if (type === 'owned') {
        if (!user) return [];
        return pagesWithFollowerInfo.filter(p => p.admin_id === user.id);
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
      const { error } = await gateway
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
      const { error } = await gateway
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
      const { data: newPage, error: createError } = await gateway
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
      const { error: followError } = await gateway
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
import { useState, useRef } from 'react';
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

export interface PageCounts {
  following: number;
  owned: number;
}

export type PageListType = 'suggested' | 'interactive' | 'new' | 'following' | 'owned';

interface PageFollowerRow {
  page_id: string;
  user_id: string;
  role?: 'follower' | 'admin' | 'editor';
  followed_at?: string;
}

interface PageRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  cover_image: string | null;
  profile_pic?: string | null;
  created_at: string;
  admin_id: string;
  archived?: boolean;
}

export const usePages = () => {
  const [loading, setLoading] = useState(true);
  // A failed list/followers read must surface as an error and must never be
  // rendered as a legitimate "no pages" / "0 followers" result.
  const [error, setError] = useState<string | null>(null);
  // Tab badges must reflect the same rows the lists are built from, so they are
  // derived from the single fetched data set rather than counted separately.
  const [counts, setCounts] = useState<PageCounts>({ following: 0, owned: 0 });
  const { toast } = useToast();
  const { user } = useAuth();
  // The signed-in viewer as of the latest render. `fetchPages` is async and auth
  // resolves asynchronously, so several calls can overlap: one may start with
  // `user === null` and a later one with the signed-in viewer. Resolving the
  // viewer at resolution time keeps the result independent of which response
  // lands last (otherwise a late signed-out response recomputes every
  // `is_following` as false and wipes the Following list / count).
  const userRef = useRef(user);
  userRef.current = user;

  const fetchPages = async (type: PageListType): Promise<Page[]> => {
    try {
      setLoading(true);
      setError(null);

      // The `pages` table has no follower_count column — the real follower count
      // lives in `page_followers`. Read both tables in parallel and derive the
      // per-page counts and the viewer's own follow state from the same rows, so
      // a list and its badge can never disagree. A followers read failure is a
      // real error: turning it into an empty list would look like "0 followers"
      // or "not following anything".
      const [pagesRes, followersRes] = await Promise.all([
        gateway.from('pages').select('*'),
        gateway.from('page_followers').select('*'),
      ]);

      if (pagesRes.error) throw pagesRes.error;
      if (followersRes.error) throw followersRes.error;

      const allFollowers: PageFollowerRow[] = (followersRes.data as PageFollowerRow[] | null) || [];

      // Count distinct (page_id, user_id) follow relationships. The primary key
      // already prevents duplicates, but the Set keeps a duplicated row from
      // inflating a count. There is no pending/invitation state on
      // `page_followers`, so every row is an active follow.
      const followerCountByPage = new Map<string, number>();
      const viewerFollowByPage = new Map<string, PageFollowerRow>();
      const viewer = userRef.current;
      const countedPairs = new Set<string>();
      for (const follow of allFollowers) {
        const pageId = follow?.page_id;
        const userId = follow?.user_id;
        if (!pageId || !userId) continue;
        const pair = `${pageId}:${userId}`;
        if (countedPairs.has(pair)) continue;
        countedPairs.add(pair);
        followerCountByPage.set(pageId, (followerCountByPage.get(pageId) || 0) + 1);
        if (viewer && userId === viewer.id) viewerFollowByPage.set(pageId, follow);
      }

      // A page must appear (and count) once even if the API returns it twice.
      const seenPages = new Set<string>();
      const pagesWithFollowerInfo: Page[] = [];
      for (const page of (pagesRes.data as PageRow[] | null) || []) {
        if (!page?.id || seenPages.has(page.id)) continue;
        seenPages.add(page.id);
        const viewerFollow = viewerFollowByPage.get(page.id) || null;
        pagesWithFollowerInfo.push({
          id: page.id,
          name: page.name,
          description: page.description,
          category: page.category,
          cover_image: page.cover_image,
          profile_pic: page.profile_pic ?? null,
          created_at: page.created_at,
          admin_id: page.admin_id,
          follower_count: followerCountByPage.get(page.id) || 0,
          is_following: !!viewerFollow,
          user_role: viewerFollow?.role,
          followed_at: viewerFollow?.followed_at,
          archived: page.archived,
        });
      }

      // Ownership is `pages.admin_id` compared against the authenticated user's
      // id (never a username), and following is the viewer's own follow rows.
      // The badges and the lists use these exact predicates.
      const isFollowing = (page: Page) => !!page.is_following;
      const isOwned = (page: Page) => !!viewer && page.admin_id === viewer.id;

      setCounts({
        following: pagesWithFollowerInfo.filter(isFollowing).length,
        owned: pagesWithFollowerInfo.filter(isOwned).length,
      });

      switch (type) {
        case 'following':
          return pagesWithFollowerInfo.filter(isFollowing);
        case 'owned':
          return pagesWithFollowerInfo.filter(isOwned);
        case 'suggested':
          return pagesWithFollowerInfo.filter((page) => !page.is_following);
        default:
          return pagesWithFollowerInfo;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load pages';
      console.error('[usePages] Failed to load pages:', message);
      setError(message);
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
    } catch {
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
    } catch {
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
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create page',
        variant: 'destructive'
      });
    }
  };

  return {
    loading,
    error,
    counts,
    fetchPages,
    followPage,
    unfollowPage,
    createPage
  };
};

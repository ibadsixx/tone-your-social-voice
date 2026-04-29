import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { createNotification } from '@/hooks/useNotifications';

export interface HomeFeedPost {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  type: 'normal_post' | 'profile_picture_update' | 'cover_photo_update' | 'shared_post' | 'reel';
  shared_post_id?: string | null;
  feeling_activity_type?: string | null;
  feeling_activity_emoji?: string | null;
  feeling_activity_text?: string | null;
  feeling_activity_target_text?: string | null;
  feeling_activity_target_id?: string | null;
  duration?: number | null;
  aspect_ratio?: string | null;
  media_type?: 'video' | 'image' | null;
  music_url?: string | null;
  music_source?: string | null;
  music_start?: number | null;
  thumbnail?: string | null;
  group_name?: string | null;
  group_id?: string | null;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
  likes?: Array<{ id: string; user_id: string }>;
  comments?: Array<{ id: string; content: string; profiles: { display_name: string } }>;
  shared_post?: {
    id: string;
    content: string | null;
    media_url: string | null;
    media_type?: string | null;
    type: string;
    created_at: string;
    profiles: {
      username: string;
      display_name: string;
      profile_pic: string | null;
    };
  } | null;
}

export const useHomeFeed = () => {
  const [posts, setPosts] = useState<HomeFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const { toast } = useToast();
  const { user } = useAuth();

  const POSTS_PER_PAGE = 10;

  const fetchPosts = useCallback(async (resetPosts = false) => {
    try {
      setLoading(true);
      const currentOffset = resetPosts ? 0 : offset;

      // Load groups the current user has explicitly unfollowed so we can hide their posts.
      let unfollowedGroupIds: string[] = [];
      if (user) {
        const { data: unfollowRows } = await supabase
          .from('group_follows' as any)
          .select('group_id')
          .eq('user_id', user.id);
        unfollowedGroupIds = (unfollowRows || []).map((r: any) => r.group_id);
      }

      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profiles!posts_user_id_fkey (
            username,
            display_name,
            profile_pic
          ),
          likes (id, user_id),
          comments (id, content, profiles:user_id (display_name)),
          shared_post:shared_post_id (
            id,
            content,
            media_url,
            media_type,
            type,
            created_at,
            profiles!posts_user_id_fkey (
              username,
              display_name,
              profile_pic
            )
          ),
          group_posts (
            group_id,
            groups:group_id (
              id,
              name
            )
          )
        `)
        .order('created_at', { ascending: false })
        .range(currentOffset, currentOffset + POSTS_PER_PAGE - 1);

      if (error) throw error;

      const postsWithTypedMedia = (data || []).map(post => {
        const groupPost = (post as any).group_posts?.[0];
        const groupInfo = groupPost?.groups;
        return {
          ...post,
          media_type: (post.media_type === 'image' || post.media_type === 'video') 
            ? post.media_type as 'image' | 'video'
            : null,
          shared_post: post.shared_post,
          group_name: groupInfo?.name || null,
          group_id: groupInfo?.id || null,
        };
      }).filter((p: any) =>
        !p.group_id || !unfollowedGroupIds.includes(p.group_id)
      ) as HomeFeedPost[];

      if (resetPosts) {
        setPosts(postsWithTypedMedia);
        setOffset(POSTS_PER_PAGE);
      } else {
        setPosts(prev => [...prev, ...postsWithTypedMedia]);
        setOffset(prev => prev + POSTS_PER_PAGE);
      }
      
      setHasMore(postsWithTypedMedia.length === POSTS_PER_PAGE);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load posts',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [offset, toast, user]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchPosts(false);
    }
  }, [fetchPosts, loading, hasMore]);

  const refresh = useCallback(() => {
    setOffset(0);
    fetchPosts(true);
  }, [fetchPosts]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!user) return;

    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;

      const existingLike = post.likes?.find(l => l.user_id === user.id);

      if (existingLike) {
        await supabase.from('likes').delete().eq('id', existingLike.id);
      } else {
        await supabase.from('likes').insert({
          post_id: postId,
          user_id: user.id
        });
        
        // Create notification for post owner
        await createNotification({
          userId: post.user_id,
          actorId: user.id,
          type: 'like',
          message: 'liked your post',
          postId: postId
        });
      }

      // Optimistic UI update
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          const likes = p.likes || [];
          if (existingLike) {
            return { ...p, likes: likes.filter(l => l.id !== existingLike.id) };
          } else {
            return { 
              ...p, 
              likes: [...likes, { id: 'temp-' + Date.now(), user_id: user.id }] 
            };
          }
        }
        return p;
      }));
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to toggle like',
        variant: 'destructive'
      });
    }
  }, [posts, user, toast]);

  const createPost = useCallback(async (
    content: string, 
    media?: File[], 
    taggedUsers?: any[], 
    audience?: any,
    feeling?: { type: string; emoji: string; text: string; targetText?: string; targetId?: string },
    scheduledAt?: Date,
    location?: { name: string; address: string; lat: number; lng: number; provider: string; provider_place_id?: string }
  ): Promise<string | undefined> => {
    if (!user || (!content.trim() && !media?.length)) return;

    console.log('[createPost] Starting post creation', {
      hasContent: !!content?.trim(),
      mediaCount: media?.length || 0,
      mediaFiles: media?.map(f => ({ name: f.name, type: f.type, size: f.size }))
    });

    try {
      let locationId = null;
      
      // Save location if provided
      if (location) {
        // First check if this location already exists
        if (location.provider_place_id && location.provider !== 'custom') {
          const { data: existing } = await supabase
            .from('locations')
            .select('id')
            .eq('provider', location.provider)
            .eq('provider_place_id', location.provider_place_id)
            .single();

          if (existing) {
            locationId = existing.id;
          }
        }

        // Create new location if it doesn't exist
        if (!locationId) {
          const { data: newLocation, error: locationError } = await supabase
            .from('locations')
            .insert({
              provider: location.provider,
              provider_place_id: location.provider_place_id,
              name: location.name,
              display_address: location.address,
              latitude: location.lat,
              longitude: location.lng,
            })
            .select('id')
            .single();

          if (locationError) {
            console.error('Error saving location:', locationError);
          } else {
            locationId = newLocation?.id;
          }
        }
      }
      // Prepare audience data
      const audienceData = audience ? {
        audience_type: audience.type,
        audience_user_ids: audience.userIds || null,
        audience_excluded_user_ids: audience.excludedUserIds || null,
        audience_list_id: audience.customListId || null
      } : {
        audience_type: 'friends'
      };

      // Prepare feeling data
      const feelingData = feeling ? {
        feeling_activity_type: feeling.type,
        feeling_activity_emoji: feeling.emoji,
        feeling_activity_text: feeling.text,
        feeling_activity_target_text: feeling.targetText || null,
        feeling_activity_target_id: feeling.targetId || null
      } : {};

      // Upload first media file and get URL
      let mediaUrl: string | null = null;
      let mediaType: 'image' | 'video' | null = null;

      if (media && media.length > 0) {
        const file = media[0];
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        const isVideo = file.type.startsWith('video/');
        const bucket = isVideo ? 'stories' : 'avatars';
        mediaType = isVideo ? 'video' : 'image';
        
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const fileName = `${user.id}/${uniqueId}.${fileExt}`;
        
        console.log(`[createPost] Uploading file:`, {
          fileName,
          type: file.type,
          size: file.size,
          bucket,
          mediaType
        });

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from(bucket)
          .upload(fileName, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) {
          console.error('[createPost] Upload error:', uploadError);
          throw new Error(`Failed to upload ${mediaType}: ${uploadError.message}`);
        }

        console.log('[createPost] Upload successful:', uploadData);

        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);

        mediaUrl = urlData.publicUrl;
        console.log('[createPost] Public URL generated:', mediaUrl);
      }

      const postData: any = {
        content: content || null,
        user_id: user.id,
        type: 'normal_post' as const,
        media_url: mediaUrl,
        media_type: mediaType,
        ...audienceData,
        ...feelingData,
        ...(location && {
          location_id: locationId,
          location_name: location.name,
          location_address: location.address,
          location_lat: location.lat,
          location_lng: location.lng,
          location_provider: location.provider
        }),
        ...(scheduledAt && {
          status: 'scheduled',
          scheduled_at: scheduledAt.toISOString()
        })
      };

      console.log('[createPost] Creating post in DB', postData);

      const { data, error } = await supabase
        .from('posts')
        .insert(postData)
        .select('id')
        .single();

      if (error) {
        console.error('[createPost] DB insert error:', error);
        throw error;
      }

      const postId = data?.id;
      console.log('[createPost] Post created with ID:', postId);

      // Persist tagged users for this post (skip on scheduled posts; they'll be created on publish)
      if (postId && !scheduledAt && Array.isArray(taggedUsers) && taggedUsers.length > 0 && user?.id) {
        const tagRows = taggedUsers
          .filter((t: any) => t?.id)
          .map((t: any) => ({
            post_id: postId,
            tagged_user_id: t.id,
            tagged_by: user.id,
          }));
        if (tagRows.length > 0) {
          const { error: tagErr } = await supabase.from('post_tags').insert(tagRows);
          if (tagErr) console.error('[createPost] Failed to insert post_tags:', tagErr);
        }
      }

      toast({
        title: 'Success',
        description: scheduledAt ? 'Post scheduled successfully' : 'Post created successfully'
      });

      if (!scheduledAt) {
        refresh();
      }
      
      console.log('[createPost] Post creation complete');
      return postId;
    } catch (error: any) {
      console.error('[createPost] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create post',
        variant: 'destructive'
      });
      throw error;
    }
  }, [user, toast, refresh]);

  useEffect(() => {
    fetchPosts(true);
  }, []);

  return {
    posts,
    loading,
    hasMore,
    loadMore,
    refresh,
    toggleLike,
    createPost
  };
};

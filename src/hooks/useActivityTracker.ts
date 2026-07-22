import { gateway } from '@/lib/gateway';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type ActivityType = 
  | 'post_created'
  | 'photo_uploaded'
  | 'profile_pic_changed'
  | 'cover_pic_changed'
  | 'group_post'
  | 'page_post'
  | 'group_created'
  | 'page_created'
  | 'comment_created'
  | 'ad_created'
  | 'post_deleted'
  | 'comment_deleted'
  | 'group_deleted'
  | 'page_deleted'
  | 'friend_request_sent'
  | 'follow'
  | 'unfollow'
  | 'unfriend';

interface ActivityMetadata {
  post_id?: string;
  group_id?: string;
  group_name?: string;
  page_id?: string;
  page_name?: string;
  friend_id?: string;
  friend_name?: string;
  user_id?: string;
  user_name?: string;
  comment_id?: string;
  comment_content?: string;
  content?: string;
  media_url?: string;
  [key: string]: any;
}

export const useActivityTracker = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const trackActivity = async (type: ActivityType, metadata: ActivityMetadata = {}) => {
    if (!user) {
      console.warn('Cannot track activity: user not authenticated');
      return;
    }

    try {
      const { error } = await gateway
        .from('user_activity')
        .insert({
          user_id: user.id,
          type,
          metadata
        });

      if (error) {
        console.error('Failed to track activity:', error);
        return;
      }

      console.log(`Activity tracked: ${type}`, metadata);
    } catch (error) {
      console.error('Error tracking activity:', error);
    }
  };

  // Helper functions for common activities
  const trackPostCreated = (postId: string, content?: string, mediaUrl?: string) => {
    trackActivity('post_created', { 
      post_id: postId, 
      content,
      media_url: mediaUrl 
    });
  };

  const trackPhotoUploaded = (mediaUrl: string, postId?: string) => {
    trackActivity('photo_uploaded', { 
      media_url: mediaUrl,
      post_id: postId 
    });
  };

  const trackProfilePicChanged = (newImageUrl: string) => {
    trackActivity('profile_pic_changed', { 
      new_image_url: newImageUrl 
    });
  };

  const trackCoverPicChanged = (newImageUrl: string) => {
    trackActivity('cover_pic_changed', { 
      new_image_url: newImageUrl 
    });
  };

  const trackGroupPost = (groupId: string, groupName: string, postId: string, content?: string) => {
    trackActivity('group_post', { 
      group_id: groupId,
      group_name: groupName,
      post_id: postId,
      content 
    });
  };

  const trackPagePost = (pageId: string, pageName: string, postId: string, content?: string) => {
    trackActivity('page_post', { 
      page_id: pageId,
      page_name: pageName,
      post_id: postId,
      content 
    });
  };

  const trackGroupCreated = (groupId: string, groupName: string) => {
    trackActivity('group_created', { 
      group_id: groupId,
      group_name: groupName 
    });
  };

  const trackPageCreated = (pageId: string, pageName: string) => {
    trackActivity('page_created', { 
      page_id: pageId,
      page_name: pageName 
    });
  };

  const trackCommentCreated = (commentId: string, postId: string, content: string) => {
    trackActivity('comment_created', { 
      comment_id: commentId,
      post_id: postId,
      comment_content: content 
    });
  };

  const trackFriendRequestSent = (friendId: string, friendName: string) => {
    trackActivity('friend_request_sent', { 
      friend_id: friendId,
      friend_name: friendName 
    });
  };

  const trackFollow = (userId: string, userName: string) => {
    trackActivity('follow', { 
      user_id: userId,
      user_name: userName 
    });
  };

  const trackUnfollow = (userId: string, userName: string) => {
    trackActivity('unfollow', { 
      user_id: userId,
      user_name: userName 
    });
  };

  const trackUnfriend = (friendId: string, friendName: string) => {
    trackActivity('unfriend', { 
      friend_id: friendId,
      friend_name: friendName 
    });
  };

  const trackPostDeleted = (postId: string) => {
    trackActivity('post_deleted', { 
      post_id: postId 
    });
  };

  const trackCommentDeleted = (commentId: string, postId: string) => {
    trackActivity('comment_deleted', { 
      comment_id: commentId,
      post_id: postId 
    });
  };

  const trackGroupDeleted = (groupId: string, groupName: string) => {
    trackActivity('group_deleted', { 
      group_id: groupId,
      group_name: groupName 
    });
  };

  const trackPageDeleted = (pageId: string, pageName: string) => {
    trackActivity('page_deleted', { 
      page_id: pageId,
      page_name: pageName 
    });
  };

  return {
    trackActivity,
    trackPostCreated,
    trackPhotoUploaded,
    trackProfilePicChanged,
    trackCoverPicChanged,
    trackGroupPost,
    trackPagePost,
    trackGroupCreated,
    trackPageCreated,
    trackCommentCreated,
    trackFriendRequestSent,
    trackFollow,
    trackUnfollow,
    trackUnfriend,
    trackPostDeleted,
    trackCommentDeleted,
    trackGroupDeleted,
    trackPageDeleted
  };
};

export default useActivityTracker;
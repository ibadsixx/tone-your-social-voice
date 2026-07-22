import { gateway } from '@/lib/gateway';
import { useAuth } from './useAuth';
import { createNotification } from './useNotifications';
import { saveHashtags } from '@/utils/hashtags';

interface MentionedUser {
  id: string;
  username: string;
  display_name: string;
}

export const useMentions = () => {
  const { user } = useAuth();

  // Extract mentions from text (e.g., "@john" -> "john")
  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+)/g;
    const matches = text.matchAll(mentionRegex);
    const usernames = Array.from(matches, match => match[1]);
    return [...new Set(usernames)]; // Remove duplicates
  };

  // Get user IDs from usernames
  const getUserIdsFromUsernames = async (usernames: string[]): Promise<MentionedUser[]> => {
    if (usernames.length === 0) return [];

    const { data, error } = await gateway
      .from('profiles')
      .select('id, username, display_name')
      .in('username', usernames);

    if (error) {
      console.error('Error fetching mentioned users:', error);
      return [];
    }

    return data || [];
  };

  // Save mentions to database
  const saveMentions = async (
    sourceType: 'post' | 'comment',
    sourceId: string,
    text: string
  ) => {
    if (!user?.id) return;

    const usernames = extractMentions(text);
    if (usernames.length === 0) return;

    const mentionedUsers = await getUserIdsFromUsernames(usernames);
    
    const mentionsToInsert = mentionedUsers.map(mentionedUser => ({
      source_type: sourceType,
      source_id: sourceId,
      mentioned_user_id: mentionedUser.id,
      created_by: user.id,
    }));

    if (mentionsToInsert.length > 0) {
      const { error } = await gateway
        .from('mentions')
        .insert(mentionsToInsert);

      if (error) {
        console.error('Error saving mentions:', error);
        return;
      }

      // Create notifications for each mentioned user
      for (const mentionedUser of mentionedUsers) {
        const message = sourceType === 'post' 
          ? `${user.user_metadata?.display_name || user.email} mentioned you in a post`
          : `${user.user_metadata?.display_name || user.email} mentioned you in a comment`;
        
        await createNotification({
          userId: mentionedUser.id,
          actorId: user.id,
          type: 'mention',
          message,
          postId: sourceType === 'post' ? sourceId : undefined,
          commentId: sourceType === 'comment' ? sourceId : undefined,
        });
      }
    }
  };

  // Get mentions for a source
  const getMentions = async (sourceType: 'post' | 'comment', sourceId: string) => {
    const { data, error } = await gateway
      .from('mentions')
      .select(`
        id,
        mentioned_user_id,
        profiles:mentioned_user_id (
          id,
          username,
          display_name,
          profile_pic
        )
      `)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);

    if (error) {
      console.error('Error fetching mentions:', error);
      return [];
    }

    return data || [];
  };

  const saveMentionsAndHashtags = async (
    sourceType: 'post' | 'comment',
    sourceId: string,
    content: string
  ) => {
    await Promise.all([
      saveMentions(sourceType, sourceId, content),
      saveHashtags(sourceType, sourceId, content),
    ]);
  };

  return {
    extractMentions,
    saveMentions,
    saveMentionsAndHashtags,
    getMentions,
    getUserIdsFromUsernames,
  };
};

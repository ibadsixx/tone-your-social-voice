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

  // Save mentions to database.
  //
  // This runs again when an existing post is edited (the EDIT POST flow calls
  // `saveMentionsAndHashtags`, the same helper a create uses). The `mentions`
  // table has no unique constraint and every insert notifies the mentioned user,
  // so a plain re-insert would duplicate rows AND re-notify people who were
  // already mentioned. Filtering against what the source already links to keeps
  // a repeated save idempotent: only genuinely new mentions are inserted and
  // notified. Obsolete-mention removal is deliberately not added here - it is
  // outside this fix's scope and would change behavior creates rely on.
  const saveMentions = async (
    sourceType: 'post' | 'comment',
    sourceId: string,
    text: string
  ) => {
    if (!user?.id) return;

    const usernames = extractMentions(text);
    if (usernames.length === 0) return;

    const mentionedUsers = await getUserIdsFromUsernames(usernames);

    const { data: existingMentions, error: existingError } = await gateway
      .from('mentions')
      .select('mentioned_user_id')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);

    if (existingError) {
      console.error('Error reading mentions:', existingError);
      return;
    }

    const existingIds = new Set<string>(
      ((existingMentions as Array<{ mentioned_user_id: string }> | null) || []).map(
        row => row.mentioned_user_id
      )
    );

    const newlyMentioned = mentionedUsers.filter(
      mentionedUser => !existingIds.has(mentionedUser.id)
    );

    const mentionsToInsert = newlyMentioned.map(mentionedUser => ({
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

      // Create notifications for each newly mentioned user only.
      for (const mentionedUser of newlyMentioned) {
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

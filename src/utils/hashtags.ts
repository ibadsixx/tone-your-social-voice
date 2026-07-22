import { gateway } from '@/lib/gateway';

/**
 * Extract unique hashtags from text
 * @param text - The text to extract hashtags from
 * @returns Array of unique hashtags (without the # symbol)
 */
export const extractHashtags = (text: string): string[] => {
  const hashtagRegex = /#(\w+)/g;
  const matches = text.matchAll(hashtagRegex);
  const hashtags = Array.from(matches, match => match[1].toLowerCase());
  return [...new Set(hashtags)]; // Remove duplicates
};

/**
 * Save hashtags to the database
 * @param sourceType - Either 'post' or 'comment'
 * @param sourceId - The ID of the post or comment
 * @param text - The text containing hashtags
 */
export const saveHashtags = async (
  sourceType: 'post' | 'comment',
  sourceId: string,
  text: string
): Promise<void> => {
  try {
    const hashtags = extractHashtags(text);
    
    if (hashtags.length === 0) {
      return;
    }

    // Insert or get existing hashtags
    for (const tag of hashtags) {
      // Try to insert the hashtag (will be ignored if it already exists due to UNIQUE constraint)
      const { data: hashtagData, error: hashtagError } = await gateway
        .from('hashtags' as any)
        .upsert({ tag }, { onConflict: 'tag' })
        .select('id')
        .single();

      if (hashtagError && hashtagError.code !== '23505') {
        console.error('Error creating hashtag:', hashtagError);
        continue;
      }

      // If upsert didn't return data, fetch the existing hashtag
      let hashtagId = (hashtagData as any)?.id;
      if (!hashtagId) {
        const { data: existingHashtag } = await gateway
          .from('hashtags' as any)
          .select('id')
          .eq('tag', tag)
          .single();
        
        hashtagId = (existingHashtag as any)?.id;
      }

      if (!hashtagId) {
        console.error('Could not get hashtag ID for tag:', tag);
        continue;
      }

      // Create the link between hashtag and source
      const { error: linkError } = await gateway
        .from('hashtag_links' as any)
        .insert({
          source_type: sourceType,
          source_id: sourceId,
          hashtag_id: hashtagId,
        });

      if (linkError) {
        console.error('Error creating hashtag link:', linkError);
      }
    }
  } catch (error) {
    console.error('Error saving hashtags:', error);
  }
};

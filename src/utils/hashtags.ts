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
 * Resolve a tag to its row id in `hashtags`, creating the row when it is new.
 *
 * This is the insert-or-get step `saveHashtags` always performed; it is lifted
 * out only so the synchronization pass can resolve every desired tag before it
 * decides what to add and remove.
 */
const resolveHashtagId = async (tag: string): Promise<string | null> => {
  const { data: hashtagData, error: hashtagError } = await gateway
    .from('hashtags')
    .upsert({ tag }, { onConflict: 'tag' })
    .select('id')
    .single();

  if (hashtagError && hashtagError.code !== '23505') {
    console.error('Error creating hashtag:', hashtagError);
    return null;
  }

  // If upsert didn't return data, fetch the existing hashtag
  let hashtagId = (hashtagData as { id?: string } | null)?.id;
  if (!hashtagId) {
    const { data: existingHashtag } = await gateway
      .from('hashtags')
      .select('id')
      .eq('tag', tag)
      .single();

    hashtagId = (existingHashtag as { id?: string } | null)?.id;
  }

  if (!hashtagId) {
    console.error('Could not get hashtag ID for tag:', tag);
    return null;
  }

  return hashtagId;
};

/**
 * Synchronize the hashtags recorded for a post or comment.
 *
 * The name is kept from the original insert-only helper, but the semantics are
 * now synchronization. Editing "#POV #Tone" to "#POV" must drop the `tone` link,
 * and editing "#POV" to plain text must drop every link - an append-only save
 * left the obsolete relationships behind, which is why an edited hashtag never
 * showed up correctly in the hashtag pages.
 *
 * Removing a link is scoped to this exact (source_type, source_id) pair, so a
 * comment or a different post is never touched.
 *
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
    const desiredTags = extractHashtags(text);

    // What this source currently links to. Read first so the pass below can
    // remove obsolete links as well as add new ones. Keyed on the same
    // (source_type, source_id, hashtag_id) triple the rows carry, so no `id`
    // column is involved.
    const { data: existingLinks, error: existingError } = await gateway
      .from('hashtag_links')
      .select('hashtag_id')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);

    if (existingError) {
      console.error('Error reading hashtag links:', existingError);
      return;
    }

    // Resolve every desired tag to an id (upserting the tags themselves).
    const desiredIds = new Set<string>();
    for (const tag of desiredTags) {
      const hashtagId = await resolveHashtagId(tag);
      if (hashtagId) desiredIds.add(hashtagId);
    }

    const existingIds = new Set<string>(
      ((existingLinks as Array<{ hashtag_id: string }> | null) || []).map(link => link.hashtag_id)
    );

    // Drop links whose tag is no longer in the text. When the text has no tags
    // at all, every existing id is absent from the desired set, so this also
    // removes every relationship.
    for (const hashtagId of existingIds) {
      if (desiredIds.has(hashtagId)) continue;

      const { error: deleteError } = await gateway
        .from('hashtag_links')
        .delete()
        .eq('source_type', sourceType)
        .eq('source_id', sourceId)
        .eq('hashtag_id', hashtagId);

      if (deleteError) {
        console.error('Error removing hashtag link:', deleteError);
      }
    }

    // Add links for tags the source does not have yet. Only the missing ones, so
    // re-saving unchanged text does not duplicate the relationship.
    for (const hashtagId of desiredIds) {
      if (existingIds.has(hashtagId)) continue;

      const { error: linkError } = await gateway
        .from('hashtag_links')
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
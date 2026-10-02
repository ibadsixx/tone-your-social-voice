/**
 * Recording that a post/reel was shared.
 *
 * WHY THIS IS SHARED
 * ------------------
 * `post_shares` had exactly one writer in the whole frontend — the reel
 * detail page's private `ReelShareModal` — while `src/lib/exploreRanking.ts`
 * reads `post_shares[0].count` as the authoritative share total for ranking.
 * The canonical post path (`SharePostModal`) recorded nothing at all.
 *
 * That is the wrong way round: the share *record* belongs to the post, not to
 * whichever surface happened to implement sharing first. So it lives here, and
 * both the post's share modal and the reel viewer call it. Reels keep the
 * behaviour they had, and posts stop silently dropping shares.
 *
 * The counter bump goes through the `increment_post_share_counts` RPC, which is
 * atomic in the database. The fallback re-reads and writes, so it is a
 * last resort for a Gateway that has not registered the RPC yet — it is not
 * race-free, which is exactly why it is not the primary path.
 */

import { gateway } from '@/lib/gateway';

export interface RecordPostShareInput {
  postId: string;
  userId: string;
  /** Audience chosen in the share sheet, stored on the share row. */
  visibility?: string | null;
  /** Optional commentary; also re-shared to the sharer's own timeline. */
  message?: string | null;
}

export interface RecordPostShareResult {
  ok: boolean;
  /** Set when the share row was written but the counter could not be bumped. */
  counterError?: string;
}

export const recordPostShare = async ({
  postId,
  userId,
  visibility = 'public',
  message = null,
}: RecordPostShareInput): Promise<RecordPostShareResult> => {
  const trimmed = message?.trim() || null;

  const { error: shareError } = await gateway
    .from('post_shares')
    .insert({
      post_id: postId,
      user_id: userId,
      visibility,
      message: trimmed,
    });

  if (shareError) return { ok: false, counterError: shareError.message };

  const { error: rpcError } = await gateway.rpc('increment_post_share_counts', {
    p_post_id: postId,
  });

  if (rpcError) {
    console.warn('[SHARE] increment_post_share_counts unavailable, falling back:', rpcError.message);
    const { data: postData } = await gateway
      .from('posts')
      .select('share_count, shares_count')
      .eq('id', postId)
      .single();
    await gateway
      .from('posts')
      .update({
        share_count: (postData?.share_count || 0) + 1,
        shares_count: (postData?.shares_count || 0) + 1,
      })
      .eq('id', postId);
  }

  // A share with commentary is also re-shared onto the sharer's own timeline,
  // matching the `shared_post` row shape the post composer already writes.
  if (trimmed) {
    await gateway.from('posts').insert({
      user_id: userId,
      content: trimmed,
      type: 'shared_post',
      shared_post_id: postId,
      visibility,
    });
  }

  return { ok: true };
};

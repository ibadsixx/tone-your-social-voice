-- Filter the Chats list to only show conversations with:
--   friends (accepted), followers/following, followed pages,
--   accepted message requests, or conversations the user participates in.
--
-- For DM conversations the other party must be a friend, a follow
-- (in either direction), have an accepted message request, or the
-- current user must have sent a message in that conversation.
-- Channels and groups are unaffected.

DROP FUNCTION IF EXISTS public.get_conversations_with_info(uuid) CASCADE;
CREATE FUNCTION public.get_conversations_with_info(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  conversation_id uuid,
  type text,
  conversation_name text,
  conversation_description text,
  created_at timestamptz,
  updated_at timestamptz,
  other_user_id uuid,
  other_user_username text,
  other_user_display_name text,
  other_user_profile_pic text,
  last_message_content text,
  last_message_created_at timestamptz,
  unread_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as conversation_id,
    c.type,
    c.name as conversation_name,
    c.description as conversation_description,
    c.created_at,
    c.updated_at,
    other_participant.user_id as other_user_id,
    other_participant.username as other_user_username,
    other_participant.display_name as other_user_display_name,
    other_participant.profile_pic as other_user_profile_pic,
    last_msg.content as last_message_content,
    last_msg.created_at as last_message_created_at,
    COALESCE(unread.count, 0) as unread_count
  FROM conversations c
  JOIN conversation_participants my_participation
    ON my_participation.conversation_id = c.id AND my_participation.user_id = p_user_id
  LEFT JOIN LATERAL (
    SELECT cp.user_id, p.username, p.display_name, p.profile_pic
    FROM conversation_participants cp
    JOIN profiles p ON p.id = cp.user_id
    WHERE cp.conversation_id = c.id AND cp.user_id != p_user_id AND c.type != 'channel'
    LIMIT 1
  ) other_participant ON true
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) last_msg ON true
  LEFT JOIN conversation_clears cc
    ON cc.conversation_id = c.id AND cc.user_id = p_user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as count
    FROM messages m
    WHERE m.conversation_id = c.id
      AND m.sender_id != p_user_id
      AND (cc.id IS NULL OR m.created_at > cc.cleared_at)
      AND NOT EXISTS (
        SELECT 1 FROM message_reads mr
        WHERE mr.message_id = m.id AND mr.user_id = p_user_id
      )
  ) unread ON true
  WHERE (c.type = 'channel' OR cc.id IS NULL OR EXISTS (
    SELECT 1 FROM messages m
    WHERE m.conversation_id = c.id AND m.created_at > cc.cleared_at
  ))
  AND (c.type != 'dm' OR EXISTS (
    SELECT 1 FROM friends f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = p_user_id AND f.receiver_id = other_participant.user_id)
        OR (f.requester_id = other_participant.user_id AND f.receiver_id = p_user_id))
  )
    OR EXISTS (
      SELECT 1 FROM follows fl
      WHERE fl.follower_id = p_user_id AND fl.following_id = other_participant.user_id
    )
    OR EXISTS (
      SELECT 1 FROM follows fl
      WHERE fl.follower_id = other_participant.user_id AND fl.following_id = p_user_id
    )
    OR (c.page_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM page_followers pf
      WHERE pf.user_id = p_user_id AND pf.page_id = c.page_id
    ))
    OR EXISTS (
      SELECT 1 FROM message_requests mr
      WHERE mr.sender_id = other_participant.user_id
        AND mr.receiver_id = p_user_id
        AND mr.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id AND m.sender_id = p_user_id
    )
  )
  ORDER BY GREATEST(c.updated_at, last_msg.created_at) DESC NULLS LAST;
END;
$$;

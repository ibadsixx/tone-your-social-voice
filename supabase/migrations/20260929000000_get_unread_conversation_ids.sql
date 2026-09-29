-- Global Messages-badge unread source (do.md "Fix the Messages unread
-- notification badge").
--
-- The badge on the Messages icon in global navigation is defined as the number
-- of conversations that currently contain unread messages (NOT the total
-- number of unread messages). The read-state architecture is `message_reads` (a
-- row per message per reader): a message sent by SOMEONE ELSE that the current
-- user has no `message_reads` row for is unread. This is the same predicate the
-- per-chat unread badges already derive from, aggregated across every
-- conversation the viewer participates in instead of one inbox list.
--
-- Rules honoured here (mirroring the existing unread system):
--   - the user's OWN messages never count (sender_id <> p_user_id);
--   - a read message never counts (NOT EXISTS message_reads);
--   - messages cleared by the user never count (only messages received after
--     `conversation_clears.cleared_at` do, same rule as
--     get_conversations_with_info);
--   - only conversations the user is a participant of count (left/removed
--     conversations fall out via the `conversation_participants` join);
--   - deleted messages cannot count -- deletes are hard deletes in this
--     schema, so the row is gone.
--
-- One thing this function deliberately does NOT do: block filtering. `blocks`
-- lives on a different project host, so the "blocked conversations must not
-- count" rule is applied by the Gateway after this set is returned (see
-- gateway/src/features/unreadConversations.ts), which is the same split the
-- suggestions feature uses.
--
-- The caller id is passed explicitly (`p_user_id`) rather than read from
-- auth.uid(), because the gateway invokes this with the verified caller id.

CREATE OR REPLACE FUNCTION public.get_unread_conversation_ids(p_user_id uuid)
RETURNS TABLE (conversation_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT m.conversation_id
  FROM messages m
  JOIN conversation_participants me
    ON me.conversation_id = m.conversation_id
   AND me.user_id = p_user_id
  WHERE m.sender_id <> p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM message_reads r
      WHERE r.message_id = m.id AND r.user_id = p_user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM conversation_clears c
      WHERE c.conversation_id = m.conversation_id
        AND c.user_id = p_user_id
        AND m.created_at <= c.cleared_at
    );
END;
$$;
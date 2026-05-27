-- Fix mark_messages_read to respect read_receipts_enabled toggle
-- Also add get_message_read_status RPC to safely read other users' read receipts (bypassing RLS)

-- 1. Update mark_messages_read RPC — skip if current user has disabled read receipts
CREATE OR REPLACE FUNCTION mark_messages_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user uuid;
BEGIN
  v_current_user := auth.uid();

  -- Verify user is participant in conversation
  IF NOT EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_current_user
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You are not a participant in this conversation';
  END IF;

  -- Respect read_receipts_enabled toggle — skip if user has disabled it
  IF EXISTS (
    SELECT 1 FROM conversation_settings cs
    WHERE cs.conversation_id = p_conversation_id
      AND cs.user_id = v_current_user
      AND cs.read_receipts_enabled = false
  ) THEN
    RETURN;
  END IF;

  -- Insert read records for all unread messages in this conversation
  INSERT INTO message_reads (message_id, user_id)
  SELECT m.id, v_current_user
  FROM messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_id != v_current_user
    AND NOT EXISTS (
      SELECT 1 FROM message_reads mr
      WHERE mr.message_id = m.id AND mr.user_id = v_current_user
    )
  ON CONFLICT (message_id, user_id) DO NOTHING;
END;
$$;

-- 2. New RPC: get message_ids that other participants have read
-- Bypasses RLS via SECURITY DEFINER so the sender can see read receipts on their own messages
CREATE OR REPLACE FUNCTION get_message_read_status(p_conversation_id uuid)
RETURNS TABLE (message_id uuid, reader_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user uuid;
BEGIN
  v_current_user := auth.uid();

  -- Verify user is participant in conversation
  IF NOT EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_current_user
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You are not a participant in this conversation';
  END IF;

  -- Return all message_reads in this conversation where the reader is NOT the current user
  RETURN QUERY
  SELECT mr.message_id, mr.user_id AS reader_user_id
  FROM message_reads mr
  JOIN messages m ON m.id = mr.message_id
  WHERE m.conversation_id = p_conversation_id
    AND mr.user_id != v_current_user;
END;
$$;

-- 3. New RPC: get the other user's read_receipts_enabled preference
-- Bypasses RLS via SECURITY DEFINER so you can see whether the person you're chatting with has read receipts on
CREATE OR REPLACE FUNCTION get_other_user_read_receipts_enabled(p_conversation_id uuid, p_other_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user uuid;
  v_enabled boolean;
BEGIN
  v_current_user := auth.uid();

  -- Verify user is participant in conversation
  IF NOT EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_current_user
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You are not a participant in this conversation';
  END IF;

  -- Fetch the other user's preference (defaults to true if no row exists)
  SELECT cs.read_receipts_enabled INTO v_enabled
  FROM conversation_settings cs
  WHERE cs.conversation_id = p_conversation_id
    AND cs.user_id = p_other_user_id;

  RETURN COALESCE(v_enabled, true);
END;
$$;

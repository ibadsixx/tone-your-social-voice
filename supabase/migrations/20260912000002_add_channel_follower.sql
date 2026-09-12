-- Add invited followers to a channel (owner or moderator only).
-- Mirrors add_group_member but for channel conversations: the caller must be an
-- owner or moderator, and the invited person is added as a 'follower'. Existing
-- roles are left untouched (never downgrade an owner/moderator who is already in).
CREATE OR REPLACE FUNCTION public.add_channel_follower(
  p_conversation_id UUID,
  p_new_follower_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_conv_type TEXT;
  v_caller_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.type INTO v_conv_type
  FROM conversations c
  WHERE c.id = p_conversation_id;

  IF v_conv_type IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_conv_type != 'channel' THEN
    RAISE EXCEPTION 'Can only add followers to channel conversations';
  END IF;

  SELECT cp.role INTO v_caller_role
  FROM conversation_participants cp
  WHERE cp.conversation_id = p_conversation_id AND cp.user_id = v_user_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'You are not a participant of this conversation';
  END IF;

  IF v_caller_role NOT IN ('owner', 'moderator') THEN
    RAISE EXCEPTION 'Only the channel owner or moderators can add followers';
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (p_conversation_id, p_new_follower_id, 'follower')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END;
$$;
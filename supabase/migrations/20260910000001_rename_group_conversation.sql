-- Rename a group conversation (owner/admin only, active member required)
CREATE OR REPLACE FUNCTION public.rename_group_conversation(
  p_conversation_id UUID,
  p_name TEXT
)
RETURNS TABLE (
  id UUID,
  name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_conv_type TEXT;
  v_role TEXT;
  v_created_by UUID;
  v_trimmed_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_trimmed_name := trim(p_name);
  IF v_trimmed_name IS NULL OR v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Group name cannot be empty';
  END IF;

  SELECT c.type, c.created_by, cp.role
    INTO v_conv_type, v_created_by, v_role
  FROM conversations c
  LEFT JOIN conversation_participants cp
    ON cp.conversation_id = c.id AND cp.user_id = v_user_id
  WHERE c.id = p_conversation_id;

  IF v_conv_type IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_conv_type != 'group' THEN
    RAISE EXCEPTION 'Can only rename group conversations';
  END IF;

  -- The caller must be an active member of the group
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a participant of this conversation';
  END IF;

  -- Only the group owner or an admin may rename the group
  IF v_user_id != v_created_by AND v_role != 'admin' THEN
    RAISE EXCEPTION 'Only the group owner or admins can rename the group';
  END IF;

  UPDATE conversations
  SET name = v_trimmed_name
  WHERE id = p_conversation_id;

  RETURN QUERY
  SELECT conversations.id, conversations.name
  FROM conversations
  WHERE conversations.id = p_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_group_conversation(uuid, text) TO authenticated;
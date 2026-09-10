-- Group admin management: prevent self-removal and support admin promotion

-- Tighten remove_group_member: an admin must not remove themselves via the
-- member-management menu (they should use the existing Leave functionality).
CREATE OR REPLACE FUNCTION public.remove_group_member(
  p_conversation_id UUID,
  p_member_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_target_role TEXT;
  v_created_by UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get caller role and target role
  SELECT cp.role INTO v_role
  FROM conversation_participants cp
  WHERE cp.conversation_id = p_conversation_id AND cp.user_id = v_user_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a participant of this conversation';
  END IF;

  -- An admin cannot remove themselves; they should use Leave instead
  IF p_member_id = v_user_id THEN
    RAISE EXCEPTION 'You cannot remove yourself from the group; use Leave instead';
  END IF;

  SELECT cp.role, c.created_by INTO v_target_role, v_created_by
  FROM conversation_participants cp
  JOIN conversations c ON c.id = cp.conversation_id
  WHERE cp.conversation_id = p_conversation_id AND cp.user_id = p_member_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a participant';
  END IF;

  -- Cannot remove the owner
  IF p_member_id = v_created_by THEN
    RAISE EXCEPTION 'Cannot remove the group owner';
  END IF;

  -- Only admins (or the owner) can remove members
  IF v_user_id != v_created_by AND v_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can remove members';
  END IF;

  -- Admins cannot remove other admins (only the owner can)
  IF v_target_role = 'admin' AND v_user_id != v_created_by THEN
    RAISE EXCEPTION 'Only the group owner can remove admins';
  END IF;

  DELETE FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id AND user_id = p_member_id;
END;
$$;

-- Promote a group member to admin (group admin or owner only)
CREATE OR REPLACE FUNCTION public.promote_group_member(
  p_conversation_id UUID,
  p_member_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_target_role TEXT;
  v_created_by UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be an active participant and a group admin
  SELECT cp.role, c.created_by INTO v_role, v_created_by
  FROM conversation_participants cp
  JOIN conversations c ON c.id = cp.conversation_id
  WHERE cp.conversation_id = p_conversation_id AND cp.user_id = v_user_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a participant of this conversation';
  END IF;

  IF v_user_id != v_created_by AND v_role != 'admin' THEN
    RAISE EXCEPTION 'Only group admins can promote members';
  END IF;

  -- Target must be an active participant
  SELECT cp.role INTO v_target_role
  FROM conversation_participants cp
  WHERE cp.conversation_id = p_conversation_id AND cp.user_id = p_member_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a participant';
  END IF;

  -- Cannot promote yourself
  IF p_member_id = v_user_id THEN
    RAISE EXCEPTION 'You are already a group admin';
  END IF;

  -- Cannot change the owner's role
  IF p_member_id = v_created_by THEN
    RAISE EXCEPTION 'Cannot change the group owner role';
  END IF;

  -- Only promote regular members (protects other admins from role changes)
  IF v_target_role != 'member' THEN
    RAISE EXCEPTION 'Target user is already a group admin';
  END IF;

  UPDATE public.conversation_participants
  SET role = 'admin'
  WHERE conversation_id = p_conversation_id AND user_id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_group_member(uuid, uuid) TO authenticated;
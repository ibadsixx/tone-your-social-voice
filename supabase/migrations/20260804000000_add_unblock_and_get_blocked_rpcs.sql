-- =============================================
-- Add unblock_user, get_blocked_users and get_block_relation RPCs
-- =============================================
-- Complements block_user / is_blocked so the gateway RPC proxy (users domain)
-- can fully manage the public.blocks table. All three are SECURITY DEFINER,
-- matching the existing block_user pattern.

-- Unblock: remove a single directional block.
CREATE OR REPLACE FUNCTION public.unblock_user(p_blocker uuid, p_blocked uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM blocks WHERE blocker_id = p_blocker AND blocked_id = p_blocked;
END;
$$;

-- List a user's directional blocks.
CREATE OR REPLACE FUNCTION public.get_blocked_users(p_user uuid)
RETURNS TABLE(blocked_id uuid, created_at timestamptz, block_type text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT blocked_id, created_at, block_type
  FROM blocks
  WHERE blocker_id = p_user
  ORDER BY created_at DESC;
$$;

-- Directional two-way block status between two users.
CREATE OR REPLACE FUNCTION public.get_block_relation(user1_id uuid, user2_id uuid)
RETURNS TABLE(user1_blocked_user2 boolean, user2_blocked_user1 boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM blocks WHERE blocker_id = user1_id AND blocked_id = user2_id),
    EXISTS (SELECT 1 FROM blocks WHERE blocker_id = user2_id AND blocked_id = user1_id);
$$;

-- =============================================
-- Add get_user_blocks RPC: bidirectional block lookup for one user
-- =============================================
-- The 'blocks' table has no registered gateway domain, so direct from('blocks')
-- calls 404. Route them through the gateway RPC proxy (users domain) instead.
-- Returns every peer the given user blocks or is blocked by.

CREATE OR REPLACE FUNCTION public.get_user_blocks(p_user uuid)
RETURNS TABLE(peer_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT blocked_id AS peer_id FROM blocks WHERE blocker_id = p_user
  UNION
  SELECT blocker_id AS peer_id FROM blocks WHERE blocked_id = p_user;
$$;

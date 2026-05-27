-- Lightweight RPC to return which message_ids the current user has already read
-- Replaces direct supabase.from('message_reads').select() in frontend for consistency
CREATE OR REPLACE FUNCTION get_my_read_message_ids(p_message_ids uuid[])
RETURNS TABLE (message_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT mr.message_id
  FROM message_reads mr
  WHERE mr.message_id = ANY(p_message_ids)
    AND mr.user_id = auth.uid();
END;
$$;

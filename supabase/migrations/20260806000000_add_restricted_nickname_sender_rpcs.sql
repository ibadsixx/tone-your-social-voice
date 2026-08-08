-- =============================================
-- Add RPCs for restricted_users, blocked_nicknames and blocked_*_senders
-- =============================================
-- These tables have no registered gateway domain, so direct from() calls
-- 404. Route them through the gateway RPC proxy (users domain) instead,
-- using SECURITY DEFINER functions that mirror the block_user pattern.

-- ---------- restricted_users ----------

CREATE OR REPLACE FUNCTION public.restrict_user(p_user uuid, p_restricted uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO restricted_users (user_id, restricted_user_id)
  VALUES (p_user, p_restricted)
  ON CONFLICT (user_id, restricted_user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.unrestrict_user(p_user uuid, p_restricted uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM restricted_users
  WHERE user_id = p_user AND restricted_user_id = p_restricted;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restricted_users(p_user uuid)
RETURNS TABLE(id uuid, restricted_user_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, restricted_user_id, created_at
  FROM restricted_users
  WHERE user_id = p_user
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.is_restricted(p_user uuid, p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM restricted_users
    WHERE user_id = p_user AND restricted_user_id = p_target
  );
$$;

-- ---------- blocked_nicknames ----------

CREATE OR REPLACE FUNCTION public.add_blocked_nickname(p_user uuid, p_nickname text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO blocked_nicknames (user_id, nickname)
  VALUES (p_user, p_nickname)
  ON CONFLICT (user_id, nickname) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_blocked_nickname(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM blocked_nicknames WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_blocked_nicknames(p_user uuid)
RETURNS TABLE(id uuid, nickname text, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nickname, created_at
  FROM blocked_nicknames
  WHERE user_id = p_user
  ORDER BY created_at DESC;
$$;

-- ---------- blocked_*_senders (generic, whitelisted table names) ----------

CREATE OR REPLACE FUNCTION public.resolve_blocked_sender_table(p_table text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
DECLARE
  tname text;
BEGIN
  SELECT CASE p_table
    WHEN 'blocked_message_senders' THEN 'blocked_message_senders'
    WHEN 'blocked_app_invite_senders' THEN 'blocked_app_invite_senders'
    WHEN 'blocked_event_invite_senders' THEN 'blocked_event_invite_senders'
    ELSE NULL
  END INTO tname;
  IF tname IS NULL THEN
    RAISE EXCEPTION 'invalid sender table: %', p_table;
  END IF;
  RETURN tname;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_blocked_senders(p_table text, p_user uuid)
RETURNS TABLE(id uuid, blocked_user_id uuid, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY EXECUTE
    format(
      'SELECT id, blocked_user_id, created_at FROM %I WHERE user_id = $1 ORDER BY created_at DESC',
      public.resolve_blocked_sender_table(p_table)
    )
    USING p_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_blocked_sender(p_table text, p_user uuid, p_blocked uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  EXECUTE
    format(
      'INSERT INTO %I (user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT (user_id, blocked_user_id) DO NOTHING',
      public.resolve_blocked_sender_table(p_table)
    )
    USING p_user, p_blocked;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_blocked_sender(p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  EXECUTE
    format(
      'DELETE FROM %I WHERE id = $1',
      public.resolve_blocked_sender_table(p_table)
    )
    USING p_id;
END;
$$;

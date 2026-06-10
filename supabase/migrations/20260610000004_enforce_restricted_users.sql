-- Enforce Restricted Users feature (Instagram-style)
-- When user A restricts user B:
--   B remains A's friend (friendship NOT removed)
--   B sees only A's public posts or posts where B is tagged
--   B sees only A's public stories
--   B gets no notification about the restriction

-- 1. Function to check if a user has restricted another user
CREATE OR REPLACE FUNCTION public.is_restricted(restricter_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restricted_users
    WHERE user_id = restricter_id
      AND restricted_user_id = target_user_id
  );
$$;

-- 2. Update can_view_post to enforce restrictions:
--    If the post author has restricted the viewer, the viewer can only see
--    public posts or posts where they are tagged (in audience_user_ids).
CREATE OR REPLACE FUNCTION public.can_view_post(
  viewer_id uuid,
  post_user_id uuid,
  audience_type text,
  audience_user_ids uuid[],
  audience_excluded_user_ids uuid[],
  audience_list_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN viewer_id = post_user_id THEN true
    WHEN public.is_restricted(post_user_id, viewer_id) THEN
      CASE
        WHEN audience_type = 'public' THEN true
        WHEN audience_type = 'specific' THEN viewer_id = ANY(COALESCE(audience_user_ids, '{}'))
        ELSE false
      END
    ELSE
      CASE
        WHEN audience_type = 'public' THEN true
        WHEN audience_type = 'only_me' THEN false
        WHEN audience_type = 'specific' THEN viewer_id = ANY(COALESCE(audience_user_ids, '{}'))
        WHEN audience_type = 'friends' THEN public.is_friend(viewer_id, post_user_id)
        WHEN audience_type = 'friends_except' THEN
          public.is_friend(viewer_id, post_user_id)
          AND NOT (viewer_id = ANY(COALESCE(audience_excluded_user_ids, '{}')))
        WHEN audience_type = 'custom_list' THEN
          EXISTS (
            SELECT 1 FROM public.audience_lists
            WHERE id = audience_list_id
            AND viewer_id = ANY(member_ids)
          )
        ELSE false
      END
  END;
$$;

-- 3. Update stories privacy policy to enforce restrictions:
--    If the story author has restricted the viewer, only public stories are visible.
DROP POLICY IF EXISTS "Stories visible based on privacy" ON public.stories;
CREATE POLICY "Stories visible based on privacy" ON public.stories
  FOR SELECT
  USING (
    CASE
      WHEN public.is_restricted(user_id, auth.uid()) THEN
        privacy = 'public'
      ELSE
        CASE privacy
          WHEN 'public' THEN true
          WHEN 'private' THEN user_id = auth.uid()
          WHEN 'friends' THEN (
            user_id = auth.uid() OR public.is_friend(auth.uid(), user_id)
          )
          WHEN 'close_friends' THEN (
            user_id = auth.uid() OR public.is_friend(auth.uid(), user_id)
          )
          ELSE false
        END
      END
  );

-- 4. Also update the block-check stories policy to prevent restricted users
--    from bypassing via the simpler expiry-based policy.
DROP POLICY IF EXISTS "Stories are viewable by everyone" ON public.stories;
CREATE POLICY "Stories are viewable by everyone" ON public.stories
FOR SELECT USING (
  (expires_at > now())
  AND (
    auth.uid() IS NULL
    OR NOT is_blocked(auth.uid(), user_id, 'full')
  )
  AND (
    auth.uid() IS NULL
    OR NOT public.is_restricted(user_id, auth.uid())
  )
);

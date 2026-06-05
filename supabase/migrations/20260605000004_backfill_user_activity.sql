CREATE OR REPLACE FUNCTION public.backfill_user_activity()
RETURNS TABLE(activity_type TEXT, count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Posts created
  INSERT INTO public.user_activity (user_id, type, metadata, created_at)
  SELECT
    p.user_id,
    CASE WHEN p.media_url IS NOT NULL AND p.media_url != '' THEN 'photo_uploaded' ELSE 'post_created' END,
    jsonb_build_object('post_id', p.id, 'content', p.content),
    p.created_at
  FROM public.posts p
  WHERE NOT EXISTS (SELECT 1 FROM public.user_activity ua WHERE ua.type IN ('post_created', 'photo_uploaded') AND ua.metadata->>'post_id' = p.id::text);
  RETURN QUERY SELECT 'posts'::TEXT, COUNT(*)::INT FROM public.posts p WHERE NOT EXISTS (SELECT 1 FROM public.user_activity ua WHERE ua.type IN ('post_created', 'photo_uploaded') AND ua.metadata->>'post_id' = p.id::text);

  -- Comments
  INSERT INTO public.user_activity (user_id, type, metadata, created_at)
  SELECT
    c.user_id,
    'comment_created',
    jsonb_build_object('post_id', c.post_id, 'comment_id', c.id, 'comment_content', c.content),
    c.created_at
  FROM public.comments c
  WHERE NOT EXISTS (SELECT 1 FROM public.user_activity ua WHERE ua.type = 'comment_created' AND ua.metadata->>'comment_id' = c.id::text);
  RETURN QUERY SELECT 'comments'::TEXT, COUNT(*)::INT FROM public.comments c WHERE NOT EXISTS (SELECT 1 FROM public.user_activity ua WHERE ua.type = 'comment_created' AND ua.metadata->>'comment_id' = c.id::text);

  -- Follows
  INSERT INTO public.user_activity (user_id, type, metadata, created_at)
  SELECT
    f.follower_id,
    'follow',
    jsonb_build_object('user_id', f.following_id, 'user_name', COALESCE(p.display_name, p.username)),
    f.created_at
  FROM public.follows f
  JOIN public.profiles p ON p.id = f.following_id
  WHERE NOT EXISTS (SELECT 1 FROM public.user_activity ua WHERE ua.type = 'follow' AND ua.metadata->>'user_id' = f.following_id::text AND ua.user_id = f.follower_id);
  RETURN QUERY SELECT 'follows'::TEXT, COUNT(*)::INT FROM public.follows f WHERE NOT EXISTS (SELECT 1 FROM public.user_activity ua WHERE ua.type = 'follow' AND ua.metadata->>'user_id' = f.following_id::text AND ua.user_id = f.follower_id);

  RETURN;
END;
$$;

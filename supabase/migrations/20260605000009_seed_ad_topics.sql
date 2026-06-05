CREATE OR REPLACE FUNCTION seed_default_ad_topics(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ad_topics (user_id, name, icon, preference)
  SELECT p_user_id, name, icon, 'neutral' FROM (VALUES
    ('Technology', '💻'),
    ('Sports', '⚽'),
    ('Fitness', '💪'),
    ('Gaming', '🎮'),
    ('Travel', '✈️'),
    ('Education', '📚')
  ) AS t(name, icon)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ad_topics WHERE user_id = p_user_id
  );
END;
$$;

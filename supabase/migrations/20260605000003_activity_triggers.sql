-- Trigger: post_created / photo_uploaded
CREATE OR REPLACE FUNCTION public.log_post_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.media_url IS NOT NULL AND NEW.media_url != '' THEN
    INSERT INTO public.user_activity (user_id, type, metadata)
    VALUES (NEW.user_id, 'photo_uploaded', jsonb_build_object('post_id', NEW.id, 'content', NEW.content));
  ELSE
    INSERT INTO public.user_activity (user_id, type, metadata)
    VALUES (NEW.user_id, 'post_created', jsonb_build_object('post_id', NEW.id, 'content', NEW.content));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_post_activity ON public.posts;
CREATE TRIGGER trg_log_post_activity
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.log_post_activity();

-- Trigger: profile_pic_changed
CREATE OR REPLACE FUNCTION public.log_profile_pic_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.profile_pic IS DISTINCT FROM OLD.profile_pic THEN
    INSERT INTO public.user_activity (user_id, type, metadata)
    VALUES (NEW.id, 'profile_pic_changed', '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profile_pic_activity ON public.profiles;
CREATE TRIGGER trg_log_profile_pic_activity
  AFTER UPDATE OF profile_pic ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_profile_pic_activity();

-- Trigger: comment_created
CREATE OR REPLACE FUNCTION public.log_comment_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_owner UUID;
BEGIN
  SELECT user_id INTO v_post_owner FROM public.posts WHERE id = NEW.post_id;
  INSERT INTO public.user_activity (user_id, type, metadata)
  VALUES (
    NEW.user_id,
    'comment_created',
    jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'comment_content', NEW.content, 'post_owner', v_post_owner)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_comment_activity ON public.comments;
CREATE TRIGGER trg_log_comment_activity
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.log_comment_activity();

-- Trigger: follow
CREATE OR REPLACE FUNCTION public.log_follow_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_name TEXT;
BEGIN
  SELECT COALESCE(display_name, username) INTO v_target_name FROM public.profiles WHERE id = NEW.following_id;
  INSERT INTO public.user_activity (user_id, type, metadata)
  VALUES (
    NEW.follower_id,
    'follow',
    jsonb_build_object('user_id', NEW.following_id, 'user_name', v_target_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_follow_activity ON public.follows;
CREATE TRIGGER trg_log_follow_activity
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.log_follow_activity();

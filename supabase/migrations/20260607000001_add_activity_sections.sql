-- Adds activity logging for likes, reactions, pokes, and search queries
-- Enables the five activity sections: Posts, Comments, Likes & Reactions, Pokes, Search

-- 1. Likes trigger
CREATE OR REPLACE FUNCTION public.log_like_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_activity (user_id, type, metadata)
  VALUES (
    NEW.user_id,
    'like_created',
    jsonb_build_object('post_id', NEW.post_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_like_activity ON public.likes;
CREATE TRIGGER trg_log_like_activity
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.log_like_activity();

-- 2. Reactions trigger
CREATE OR REPLACE FUNCTION public.log_reaction_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_activity (user_id, type, metadata)
  VALUES (
    NEW.user_id,
    'reaction_created',
    jsonb_build_object('post_id', NEW.post_id, 'reaction_type', NEW.type)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_reaction_activity ON public.reactions;
CREATE TRIGGER trg_log_reaction_activity
  AFTER INSERT ON public.reactions
  FOR EACH ROW EXECUTE FUNCTION public.log_reaction_activity();

-- 3. Pokes table + trigger
CREATE TABLE IF NOT EXISTS public.pokes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poking_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  poked_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.pokes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pokes"
  ON public.pokes FOR SELECT
  USING (auth.uid() = poking_user_id OR auth.uid() = poked_user_id);

CREATE POLICY "Users can insert their own pokes"
  ON public.pokes FOR INSERT
  WITH CHECK (auth.uid() = poking_user_id);

CREATE POLICY "Users can delete their own pokes"
  ON public.pokes FOR DELETE
  USING (auth.uid() = poking_user_id);

CREATE INDEX idx_pokes_poking_user ON public.pokes(poking_user_id);
CREATE INDEX idx_pokes_poked_user ON public.pokes(poked_user_id);

CREATE OR REPLACE FUNCTION public.log_poke_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_name TEXT;
BEGIN
  SELECT COALESCE(display_name, username) INTO v_target_name FROM public.profiles WHERE id = NEW.poked_user_id;
  INSERT INTO public.user_activity (user_id, type, metadata)
  VALUES (
    NEW.poking_user_id,
    'poke_created',
    jsonb_build_object('poked_user_id', NEW.poked_user_id, 'poked_user_name', v_target_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_poke_activity ON public.pokes;
CREATE TRIGGER trg_log_poke_activity
  AFTER INSERT ON public.pokes
  FOR EACH ROW EXECUTE FUNCTION public.log_poke_activity();

-- 4. Search history trigger
CREATE OR REPLACE FUNCTION public.log_search_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_activity (user_id, type, metadata)
  VALUES (
    NEW.user_id,
    'search_query',
    jsonb_build_object('query', NEW.query)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_search_activity ON public.search_history;
CREATE TRIGGER trg_log_search_activity
  AFTER INSERT ON public.search_history
  FOR EACH ROW EXECUTE FUNCTION public.log_search_activity();

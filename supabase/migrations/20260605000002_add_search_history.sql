CREATE TABLE public.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  query TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own search history"
  ON public.search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search history"
  ON public.search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own search history"
  ON public.search_history FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_search_history_user_id ON public.search_history(user_id);
CREATE INDEX idx_search_history_created_at ON public.search_history(created_at DESC);

CREATE OR REPLACE FUNCTION public.add_search_entry(p_query TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_entry_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_query IS NULL OR p_query = '' THEN
    RAISE EXCEPTION 'Search query is required';
  END IF;

  INSERT INTO public.search_history (user_id, query)
  VALUES (v_user_id, p_query)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_search_history()
RETURNS TABLE(
  id UUID,
  query TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT sh.id, sh.query, sh.created_at
  FROM public.search_history sh
  WHERE sh.user_id = auth.uid()
  ORDER BY sh.created_at DESC
  LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_search_entry(p_entry_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.search_history
  WHERE id = p_entry_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_my_search_history()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.search_history
  WHERE user_id = auth.uid();
END;
$$;

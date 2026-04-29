-- Track per-user follow state for groups (separate from membership)
CREATE TABLE IF NOT EXISTS public.group_follows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE public.group_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own group follow state"
ON public.group_follows FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can follow groups for themselves"
ON public.group_follows FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unfollow groups for themselves"
ON public.group_follows FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_group_follows_user ON public.group_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_group_follows_group ON public.group_follows(group_id);
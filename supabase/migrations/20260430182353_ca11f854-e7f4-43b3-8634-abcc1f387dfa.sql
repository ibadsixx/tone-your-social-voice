CREATE TABLE public.group_pins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE public.group_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own group pins"
ON public.group_pins
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can pin groups for themselves"
ON public.group_pins
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unpin their own groups"
ON public.group_pins
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_group_pins_user_id ON public.group_pins(user_id);
CREATE TABLE public.advertisers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  domain TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TYPE public.ad_interaction_type AS ENUM ('viewed', 'clicked', 'visited');

CREATE TABLE public.user_ad_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  advertiser_id UUID REFERENCES public.advertisers(id) ON DELETE CASCADE NOT NULL,
  interaction_type public.ad_interaction_type NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.user_ad_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ad interactions"
  ON public.user_ad_interactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ad interactions"
  ON public.user_ad_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_ad_interactions_user_id ON public.user_ad_interactions(user_id);
CREATE INDEX idx_user_ad_interactions_advertiser_id ON public.user_ad_interactions(advertiser_id);

INSERT INTO public.advertisers (name, domain) VALUES
  ('Nike', 'nike.com'),
  ('Samsung', 'samsung.com'),
  ('Amazon', 'amazon.com'),
  ('Spotify', 'spotify.com'),
  ('Apple', 'apple.com'),
  ('Netflix', 'netflix.com'),
  ('Adobe', 'adobe.com'),
  ('Uber', 'uber.com'),
  ('Coca-Cola', 'coca-cola.com'),
  ('Toyota', 'toyota.com');

INSERT INTO public.user_ad_interactions (user_id, advertiser_id, interaction_type, created_at)
SELECT
  '07d4672e-bbdf-4e59-94c2-dd4fbc3d117f',
  a.id,
  interaction,
  now() - interval_offset
FROM (
  VALUES
    ('Nike', 'clicked'::public.ad_interaction_type, interval '2 days'),
    ('Samsung', 'viewed'::public.ad_interaction_type, interval '7 days'),
    ('Amazon', 'clicked'::public.ad_interaction_type, interval '21 days'),
    ('Spotify', 'viewed'::public.ad_interaction_type, interval '1 day'),
    ('Apple', 'clicked'::public.ad_interaction_type, interval '14 days'),
    ('Netflix', 'visited'::public.ad_interaction_type, interval '5 days'),
    ('Adobe', 'viewed'::public.ad_interaction_type, interval '30 days'),
    ('Uber', 'clicked'::public.ad_interaction_type, interval '10 days')
) AS seed(name, interaction, interval_offset)
JOIN public.advertisers a ON a.name = seed.name;

CREATE OR REPLACE FUNCTION public.get_my_advertisers()
RETURNS TABLE(
  advertiser_id UUID,
  name TEXT,
  domain TEXT,
  last_interaction_type TEXT,
  last_interaction_at TIMESTAMP WITH TIME ZONE
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
  SELECT DISTINCT ON (a.id)
    a.id,
    a.name,
    a.domain,
    ui.interaction_type::TEXT,
    ui.created_at
  FROM public.advertisers a
  INNER JOIN public.user_ad_interactions ui ON ui.advertiser_id = a.id
  WHERE ui.user_id = auth.uid()
  ORDER BY a.id, ui.created_at DESC;
END;
$$;

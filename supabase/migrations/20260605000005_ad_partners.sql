CREATE TABLE public.ad_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_color TEXT NOT NULL DEFAULT 'blue',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

INSERT INTO public.ad_partners (name, description, icon_color) VALUES
  ('Global Ads Network', 'Personalized ads based on your interests', 'blue'),
  ('Privacy-First Ads', 'Non-tracking advertisement service', 'green'),
  ('Social Commerce', 'Ads from brands you follow', 'purple');

ALTER TABLE public.ad_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ad partners are viewable by everyone" ON public.ad_partners FOR SELECT USING (true);

CREATE TABLE public.user_ad_partner_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  partner_id UUID REFERENCES public.ad_partners(id) ON DELETE CASCADE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  PRIMARY KEY (user_id, partner_id)
);

ALTER TABLE public.user_ad_partner_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own ad partner settings" ON public.user_ad_partner_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert their own ad partner settings" ON public.user_ad_partner_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ad partner settings" ON public.user_ad_partner_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own ad partner settings" ON public.user_ad_partner_settings FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_user_ad_partner_settings_user_id ON public.user_ad_partner_settings(user_id);

CREATE OR REPLACE FUNCTION public.get_my_ad_partners()
RETURNS TABLE(
  partner_id UUID,
  name TEXT,
  description TEXT,
  icon_color TEXT,
  enabled BOOLEAN
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
  SELECT
    ap.id,
    ap.name,
    ap.description,
    ap.icon_color,
    COALESCE(uaps.enabled, true) AS enabled
  FROM public.ad_partners ap
  LEFT JOIN public.user_ad_partner_settings uaps ON uaps.partner_id = ap.id AND uaps.user_id = auth.uid()
  ORDER BY ap.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_ad_partner(p_partner_id UUID, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_ad_partner_settings (user_id, partner_id, enabled)
  VALUES (v_user_id, p_partner_id, p_enabled)
  ON CONFLICT (user_id, partner_id) DO UPDATE SET enabled = p_enabled;
END;
$$;

CREATE OR REPLACE FUNCTION public.opt_out_all_ad_partners()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_ad_partner_settings (user_id, partner_id, enabled)
  SELECT v_user_id, id, false FROM public.ad_partners
  ON CONFLICT (user_id, partner_id) DO UPDATE SET enabled = false;
END;
$$;


-- Table for profile-based categories (employer, job title, education, etc.)
CREATE TABLE public.ad_profile_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  category_type TEXT NOT NULL, -- e.g. 'employer', 'job_title', 'education', 'relationship_status'
  is_used BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ad_profile_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ad profile categories"
  ON public.ad_profile_categories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own ad profile categories"
  ON public.ad_profile_categories FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Table for associated categories (birthday month, shopper type, browser, etc.)
CREATE TABLE public.ad_associated_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ad_associated_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ad associated categories"
  ON public.ad_associated_categories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own ad associated categories"
  ON public.ad_associated_categories FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

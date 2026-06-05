ALTER TABLE public.ad_settings
  ADD COLUMN use_categories BOOLEAN DEFAULT true,
  ADD COLUMN audience_based_advertising BOOLEAN DEFAULT true;

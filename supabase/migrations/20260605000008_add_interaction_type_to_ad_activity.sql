ALTER TABLE public.ad_activity
  ADD COLUMN interaction_type TEXT NOT NULL DEFAULT 'viewed';

CREATE INDEX idx_ad_activity_interaction_type ON public.ad_activity(user_id, interaction_type);

ALTER TABLE public.ad_activity
  ADD CONSTRAINT chk_interaction_type CHECK (interaction_type IN ('viewed', 'clicked', 'hidden'));

-- Add links column to pages table for website/social media links
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS links jsonb DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_pages_links ON public.pages USING gin(links);

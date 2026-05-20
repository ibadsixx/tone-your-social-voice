-- Add button_type and button_url columns to pages table for CTA buttons
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS button_type text;
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS button_url text;

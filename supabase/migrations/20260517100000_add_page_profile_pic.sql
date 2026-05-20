-- Add profile_pic column to pages table for page avatars
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS profile_pic text;

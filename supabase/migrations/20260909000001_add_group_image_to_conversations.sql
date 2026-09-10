-- Add group_image column to conversations table for group chat profile pictures
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS group_image TEXT;

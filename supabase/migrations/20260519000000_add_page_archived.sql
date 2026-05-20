-- Add archived column to pages table for page archiving
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false NOT NULL;

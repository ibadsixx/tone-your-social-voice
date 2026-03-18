
-- Add cover_image column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS cover_image text;

-- Create storage bucket for group covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('group_covers', 'group_covers', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload group covers
CREATE POLICY "Authenticated users can upload group covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'group_covers');

-- Allow public read access to group covers
CREATE POLICY "Public can view group covers"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'group_covers');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update group covers"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'group_covers');

-- Allow authenticated users to delete group covers
CREATE POLICY "Authenticated users can delete group covers"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'group_covers');

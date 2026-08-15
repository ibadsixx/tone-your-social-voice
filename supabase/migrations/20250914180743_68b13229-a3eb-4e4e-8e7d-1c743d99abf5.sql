-- Add sticker support to messages table
ALTER TABLE messages
  ADD COLUMN sticker_id TEXT,
  ADD COLUMN sticker_url TEXT, 
  ADD COLUMN sticker_set TEXT,
  ADD COLUMN is_sticker BOOLEAN DEFAULT false;

-- Create stickers storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('stickers', 'stickers', true);

-- Create RLS policies for stickers bucket
CREATE POLICY "Stickers are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'stickers');

-- Allow authenticated users to upload stickers (for future admin/custom stickers)
CREATE POLICY "Authenticated users can upload stickers" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'stickers' AND auth.role() = 'authenticated');

-- Create sticker_packs table to organize stickers
CREATE TABLE public.sticker_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT, -- emoji icon for the pack
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create stickers table to store sticker metadata
CREATE TABLE public.stickers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pack_id UUID REFERENCES sticker_packs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- path in storage bucket
  file_url TEXT NOT NULL, -- full public URL
  file_size INTEGER, -- file size in bytes
  file_type TEXT, -- png, gif, webp
  tags TEXT[], -- searchable tags
  is_animated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;

-- RLS policies for sticker_packs (public read, admin write)
CREATE POLICY "Sticker packs are viewable by everyone" 
ON public.sticker_packs 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Authenticated users can manage sticker packs" 
ON public.sticker_packs 
FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- RLS policies for stickers (public read, admin write)
CREATE POLICY "Stickers are viewable by everyone" 
ON public.stickers 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage stickers" 
ON public.stickers 
FOR ALL 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Insert default sticker packs
INSERT INTO public.sticker_packs (name, description, emoji) VALUES
  ('Default', 'Basic expression stickers', '😊'),
  ('Animals', 'Cute animal stickers', '🐱'),
  ('Reactions', 'Reaction and emotion stickers', '🎭');

-- Add some example stickers (these will need actual files uploaded to storage)
INSERT INTO public.stickers (pack_id, name, file_path, file_url, file_type, tags) 
SELECT 
  p.id,
  'Happy Face',
  'default/happy-face.png',
  'https://gateway-iota-two.vercel.app/storage/stickers/default/happy-face.png',
  'png',
  ARRAY['happy', 'smile', 'joy']
FROM sticker_packs p WHERE p.name = 'Default';

INSERT INTO public.stickers (pack_id, name, file_path, file_url, file_type, tags)
SELECT 
  p.id,
  'Thumbs Up',
  'default/thumbs-up.png',
  'https://gateway-iota-two.vercel.app/storage/stickers/default/thumbs-up.png',
  'png',
  ARRAY['thumbs', 'up', 'good', 'approve']
FROM sticker_packs p WHERE p.name = 'Default';

INSERT INTO public.stickers (pack_id, name, file_path, file_url, file_type, tags)
SELECT 
  p.id,
  'Cat Love',
  'animals/cat-love.gif',
  'https://gateway-iota-two.vercel.app/storage/stickers/animals/cat-love.gif',
  'gif',
  ARRAY['cat', 'love', 'heart', 'cute']
FROM sticker_packs p WHERE p.name = 'Animals';

-- Add timestamp trigger for sticker_packs
CREATE TRIGGER update_sticker_packs_updated_at
BEFORE UPDATE ON public.sticker_packs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Add duration and aspect_ratio columns to posts table for reel support
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS duration INTEGER,
ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '9:16';

-- Add comment explaining the duration constraint
COMMENT ON COLUMN posts.duration IS 'Video duration in seconds. For reels, at least 3 seconds with no maximum';
COMMENT ON COLUMN posts.aspect_ratio IS 'Video aspect ratio. For reels, should be 9:16';

-- Create index for filtering reels by duration
CREATE INDEX IF NOT EXISTS idx_posts_duration ON posts(duration) WHERE duration IS NOT NULL;
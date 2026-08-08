ALTER TABLE profiles ADD COLUMN IF NOT EXISTS font_scale TEXT DEFAULT 'normal';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reduce_motion BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reduce_transparency BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS high_contrast BOOLEAN DEFAULT FALSE;

ALTER TABLE profiles ADD CONSTRAINT check_font_scale_values
  CHECK (font_scale IN ('small', 'normal', 'large'));

-- Add manual_status column to profiles for explicit online/offline override
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manual_status TEXT CHECK (manual_status IN ('online', 'offline'));

-- Notification and appearance preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_sounds BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS do_not_disturb_until TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN DEFAULT FALSE;

-- Table for status visibility overrides (ON for some / Off for some)
CREATE TABLE IF NOT EXISTS status_visibility (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL CHECK (visibility IN ('visible', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, target_user_id)
);

-- RLS
ALTER TABLE status_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own status visibility"
  ON status_visibility
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to get users who should see you as online
CREATE OR REPLACE FUNCTION get_visible_to_user(p_target_user_id UUID)
RETURNS TABLE(user_id UUID) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT sv.user_id
  FROM status_visibility sv
  WHERE sv.target_user_id = p_target_user_id
    AND sv.visibility = 'visible';
END;
$$;

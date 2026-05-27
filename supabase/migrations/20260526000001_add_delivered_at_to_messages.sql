-- Add delivered_at column to messages for delivery receipts
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_delivered_at ON messages (delivered_at) WHERE delivered_at IS NOT NULL;

-- RPC for the receiving client to acknowledge message delivery
CREATE OR REPLACE FUNCTION mark_message_delivered(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE messages
  SET delivered_at = COALESCE(delivered_at, NOW())
  WHERE id = p_message_id
    AND delivered_at IS NULL;
END;
$$;

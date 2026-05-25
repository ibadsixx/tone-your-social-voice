-- Add expires_at column to messages table for vanishing messages support
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_messages_expires_at 
ON public.messages(expires_at) 
WHERE expires_at IS NOT NULL;

-- Create function to auto-set expires_at on insert based on sender's vanishing settings
CREATE OR REPLACE FUNCTION public.set_message_expires_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vanishing_enabled BOOLEAN;
  v_vanishing_duration INTEGER;
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT 
      cs.vanishing_messages_enabled, 
      cs.vanishing_messages_duration
    INTO v_vanishing_enabled, v_vanishing_duration
    FROM public.conversation_settings cs
    WHERE cs.conversation_id = NEW.conversation_id 
      AND cs.user_id = NEW.sender_id;

    IF v_vanishing_enabled THEN
      NEW.expires_at = NOW() + (COALESCE(v_vanishing_duration, 86400) * INTERVAL '1 second');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to auto-set expires_at before inserting a message
CREATE TRIGGER set_message_expires_at_trigger
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_message_expires_at();

-- RPC to delete all expired messages (called by cron Edge Function)
CREATE OR REPLACE FUNCTION public.delete_expired_messages()
RETURNS TABLE(deleted_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  WITH deleted AS (
    DELETE FROM public.messages
    WHERE expires_at IS NOT NULL 
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN QUERY SELECT v_count AS deleted_count;
END;
$$;

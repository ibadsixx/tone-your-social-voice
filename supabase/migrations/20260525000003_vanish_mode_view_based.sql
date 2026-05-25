-- Add vanish_on_read flag to messages for Instagram-style vanish mode
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS vanish_on_read BOOLEAN DEFAULT FALSE;

-- Update trigger function: set vanish_on_read + expires_at for DMs with vanish mode enabled
-- Also restrict to DM conversations only (type = 'dm')
CREATE OR REPLACE FUNCTION public.set_message_expires_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vanishing_enabled BOOLEAN;
  v_vanishing_duration INTEGER;
  v_conv_type TEXT;
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    -- Only apply vanish mode to DM conversations
    SELECT c.type INTO v_conv_type
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;

    IF v_conv_type = 'dm' THEN
      SELECT 
        cs.vanishing_messages_enabled, 
        cs.vanishing_messages_duration
      INTO v_vanishing_enabled, v_vanishing_duration
      FROM public.conversation_settings cs
      WHERE cs.conversation_id = NEW.conversation_id 
        AND cs.user_id = NEW.sender_id;

      IF v_vanishing_enabled THEN
        NEW.vanish_on_read = TRUE;
        NEW.expires_at = NOW() + (COALESCE(v_vanishing_duration, 86400) * INTERVAL '1 second');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- RPC: Delete vanish-mode messages that have been read by the other participant
-- Called from frontend when user leaves/closes a chat conversation
CREATE OR REPLACE FUNCTION public.delete_read_vanish_messages(p_conversation_id UUID)
RETURNS TABLE(deleted_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user UUID;
  v_count BIGINT;
BEGIN
  v_current_user := auth.uid();

  -- Only proceed if this is a DM conversation
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id AND c.type = 'dm'
  ) THEN
    RETURN QUERY SELECT 0::BIGINT AS deleted_count;
    RETURN;
  END IF;

  WITH deleted AS (
    DELETE FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.vanish_on_read = TRUE
      AND EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = p_conversation_id
          AND cp.user_id = v_current_user
      )
      AND (
        -- Message was sent by the other user and read by current user
        (m.sender_id != v_current_user
         AND EXISTS (
           SELECT 1 FROM public.message_reads mr
           WHERE mr.message_id = m.id
             AND mr.user_id = v_current_user
         ))
        OR
        -- Message was sent by current user and read by the other user
        (m.sender_id = v_current_user
         AND EXISTS (
           SELECT 1 FROM public.message_reads mr
           JOIN public.conversation_participants cp ON cp.user_id = mr.user_id
           WHERE mr.message_id = m.id
             AND cp.conversation_id = p_conversation_id
             AND mr.user_id != v_current_user
         ))
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN QUERY SELECT v_count AS deleted_count;
END;
$$;

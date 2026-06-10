-- When a new message arrives in an archived conversation,
-- automatically unarchive it for all other participants (like Facebook Messenger).
-- This ensures archived conversations return to the main Chats list
-- when someone sends a new message.

CREATE OR REPLACE FUNCTION public.auto_unarchive_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversation_participants
  SET archived_at = NULL
  WHERE conversation_id = NEW.conversation_id
    AND user_id != NEW.sender_id
    AND archived_at IS NOT NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_unarchive_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_unarchive_on_message();
